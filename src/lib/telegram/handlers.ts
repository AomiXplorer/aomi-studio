/**
 * The bot's router.
 *
 * Rules that hold on every path: the sender id is checked before anything else (messages
 * and callback queries alike), every mutation is written through the same stores the web
 * app uses, and every mutation is recorded in the audit log with the Telegram id as actor.
 */
import { aiConfig } from "@/lib/ai/config";
import { adminCount, createUserWithHash, getUserById, getUserByUsername, listUsers, setPasswordHash, setRole, setStatus, userStats, type RawUser } from "@/lib/db/users";
import { addSealedApiKey, decryptKey, deleteApiKey, getApiKey, listApiKeys, recordKeyCheck, setActiveKey, toggleApiKey } from "@/lib/db/apikeys";
import { createBackup, listBackupFiles } from "@/lib/db/backup";
import { audit } from "@/lib/db/audit";
import { PANEL_URL } from "@/lib/db/keys";
import { readSiteMeta, writeSettings, SITE_META_DEFAULTS } from "@/lib/db/settings";
import { purgeUserProjects } from "@/lib/db/projects";
import { hashPasswordForFlow, usernameProblem as usernameProblemFn } from "./validate";
import { sealSecret, maskSecret, fingerprint } from "@/lib/crypto/secrets";
import { adminIds, isTelegramAdmin, recordRejection } from "./auth";
import { readFlow, writeFlow, clearFlow, throttled, type Flow } from "./state";
import { answerCallback, editMessage, getMe, sendMessage, type InlineButton } from "./api";
import * as S from "./screens";
import { card, esc, RULE, when, ago, shortId, clip } from "./ui";

type ChatId = number | string;

interface Update {
  message?: { message_id: number; chat: { id: number }; from?: { id: number; username?: string }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; username?: string };
    message?: { message_id: number; chat: { id: number } };
  };
}

export async function handleUpdate(update: Update): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message);
}

async function handleMessage(message: NonNullable<Update["message"]>): Promise<void> {
  const chatId = message.chat.id;
  const from = message.from;
  const text = (message.text || "").trim();
  if (!text) return;

  if (!isTelegramAdmin(from?.id)) {
    await recordRejection(from?.id, from?.username, text.split(/\s+/)[0]);
    await sendMessage(chatId, "This bot is private. Only the authorised administrator can use it.");
    return;
  }
  if (await throttled(chatId)) return;

  if (text.startsWith("/")) {
    await runCommand(chatId, text);
    return;
  }

  const flow = await readFlow(chatId);
  if (flow) {
    await handleFlowInput(chatId, flow, text);
    return;
  }
  await sendMessage(chatId, "Unknown input. Type /help for the command list.", S.mainMenu());
}

function parseCommand(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].replace(/@[\w_]+$/, "").toLowerCase();
  return { command, args: parts.slice(1) };
}

async function runCommand(chatId: ChatId, text: string): Promise<void> {
  const { command, args } = parseCommand(text);
  const actor = `telegram:${chatId}`;

  switch (command) {
    case "/start":
    case "/menu": {
      const me = await getMe();
      await sendMessage(chatId, S.welcome(me.result?.username || "aomi"), S.mainMenu());
      return;
    }
    case "/help":
      await sendMessage(chatId, S.help(), S.mainMenu());
      return;
    case "/cancel":
      await clearFlow(chatId);
      await sendMessage(chatId, "Cancelled. Nothing was changed.", S.mainMenu());
      return;

    case "/addtoken": {
      await clearFlow(chatId);
      await writeFlow(chatId, { kind: "addtoken", step: "provider" });
      await sendMessage(
        chatId,
        card([
          "<b>New provider key · step 1 of 3</b>",
          RULE,
          "Send the provider name, or press the button.",
          `Current adapter: <code>${esc(providerName())}</code>`,
        ]),
        [[{ text: providerName(), callback_data: "f:provider:default" }], [{ text: "Cancel", callback_data: "f:no" }]],
      );
      return;
    }
    case "/meta": {
      const screen = await S.siteMetaScreen();
      await sendMessage(chatId, screen.text, screen.keyboard);
      return;
    }
    case "/settitle": {
      const value = cleanMeta(args.join(" "));
      if (!value) {
        await clearFlow(chatId);
        await writeFlow(chatId, { kind: "sitemeta", field: "title" });
        await sendMessage(
          chatId,
          card(["<b>New link title</b>", RULE, "Send the title to use, 3-80 characters.", "Example: Aomi Studio — AI agent untuk bikin project"]),
          [[{ text: "Cancel", callback_data: "f:no" }]],
        );
        return;
      }
      await saveSiteMeta(chatId, "title", value);
      return;
    }
    case "/setdesc": {
      const value = cleanMeta(args.join(" "));
      if (!value) {
        await clearFlow(chatId);
        await writeFlow(chatId, { kind: "sitemeta", field: "description" });
        await sendMessage(
          chatId,
          card(["<b>New link description</b>", RULE, "Send the description to use, 10-200 characters.", "Example: Agent AI yang menulis file dan menyerahkan project siap unduh."]),
          [[{ text: "Cancel", callback_data: "f:no" }]],
        );
        return;
      }
      await saveSiteMeta(chatId, "description", value);
      return;
    }
    case "/listtoken": {
      const screen = await S.keysList();
      await sendMessage(chatId, screen.text, screen.keyboard);
      return;
    }
    case "/activetoken": {
      const keys = await listApiKeys();
      const active = keys.find((key) => key.active);
      await sendMessage(
        chatId,
        active
          ? card(["<b>Active provider key</b>", RULE, `<code>${esc(active.masked)}</code> · ${esc(active.label || "no label")}`, `added ${when(active.addedAt)} · last used ${ago(active.lastUsedAt)}`])
          : card(["<b>Active provider key</b>", RULE, "No key in the database.", "The deployment environment variable is used until /addtoken adds one."]),
        [[{ text: "Choose another", callback_data: "m:keys" }]],
      );
      return;
    }
    case "/changetoken": {
      const keys = await listApiKeys();
      if (keys.length === 0) {
        await sendMessage(chatId, "No key stored yet. Use /addtoken first.");
        return;
      }
      await sendMessage(
        chatId,
        "<b>Switch the active key</b>\nPick one. The app uses it on the next request.",
        keys.map((key) => [{ text: `${key.active ? "● " : "○ "}${key.masked}`, callback_data: `k:use:${key.id}` }]),
      );
      return;
    }
    case "/deletetoken": {
      const keys = await listApiKeys();
      if (keys.length === 0) {
        await sendMessage(chatId, "No key stored yet.");
        return;
      }
      await sendMessage(
        chatId,
        "<b>Delete a key</b>\nYou will be asked to confirm.",
        keys.map((key) => [{ text: key.masked, callback_data: `k:del:${key.id}` }]),
      );
      return;
    }
    case "/tokenstatus": {
      const keys = await listApiKeys();
      if (keys.length === 0) {
        await sendMessage(chatId, "No key stored. /tokenstatus has nothing to test.");
        return;
      }
      await sendMessage(chatId, "Testing each key against the provider…");
      for (const key of keys) {
        const check = await checkKey(key.id);
        await sendMessage(
          chatId,
          card([
            `<b>${esc(key.masked)}</b>${key.active ? " · ACTIVE" : ""}`,
            `result ${check.ok ? `ok · ${check.models ?? 0} models` : "failed"}`,
            check.message ? `detail ${esc(check.message)}` : "",
          ]),
        );
      }
      await audit({ actorType: "telegram", actorId: String(chatId), action: "apikey.status_checked", detail: `${keys.length} key(s)` });
      return;
    }

    case "/adduser": {
      await clearFlow(chatId);
      await writeFlow(chatId, { kind: "adduser", step: "username" });
      await sendMessage(
        chatId,
        card(["<b>New account · step 1 of 3</b>", RULE, "Send the username (3-32 chars: letters, digits, dot, dash, underscore)."]),
        [[{ text: "Cancel", callback_data: "f:no" }]],
      );
      return;
    }
    case "/listuser":
    case "/listusers": {
      const screen = await S.usersList();
      await sendMessage(chatId, screen.text, screen.keyboard);
      return;
    }
    case "/userinfo": {
      const user = await resolveUser(args[0]);
      if (!user) {
        await sendUserPicker(chatId, "Whose details?");
        return;
      }
      await sendMessage(chatId, S.userCard(user, await userStats(user.id)), S.userKeyboard(user));
      return;
    }
    case "/edituser": {
      const user = await resolveUser(args[0]);
      if (!user) {
        await sendUserPicker(chatId, "Which account do you want to edit?");
        return;
      }
      await sendMessage(chatId, S.userCard(user, await userStats(user.id)), S.userKeyboard(user));
      return;
    }
    case "/deleteuser": {
      const user = await resolveUser(args[0]);
      if (!user) {
        await sendUserPicker(chatId, "Which account do you want to delete?");
        return;
      }
      await confirmDeleteUser(chatId, user);
      return;
    }
    case "/resetpassword": {
      const user = await resolveUser(args[0]);
      if (!user) {
        await sendUserPicker(chatId, "Whose password do you want to reset?");
        return;
      }
      await startPasswordReset(chatId, user);
      return;
    }
    case "/banuser":
    case "/unbanuser": {
      const user = await resolveUser(args[0]);
      if (!user) {
        await sendUserPicker(chatId, command === "/banuser" ? "Who should be banned?" : "Who should be re-enabled?");
        return;
      }
      await setUserStatus(chatId, user, command === "/banuser" ? "banned" : "active");
      return;
    }

    case "/stats":
      await sendMessage(chatId, await S.stats(), S.mainMenu());
      return;
    case "/database":
      await sendMessage(chatId, await S.database(), S.mainMenu());
      return;
    case "/userstats": {
      const user = await resolveUser(args[0]);
      if (!user) {
        await sendUserPicker(chatId, "Whose activity do you want to see?");
        return;
      }
      await sendMessage(chatId, (await S.userStatsScreen(user.id)) || "User not found.");
      return;
    }
    case "/backup": {
      await sendMessage(chatId, "Creating an encrypted snapshot…");
      const result = await createBackup(actor);
      if (result.error) {
        await sendMessage(chatId, `Backup failed: ${esc(result.error)}`);
        await audit({ actorType: "telegram", actorId: String(chatId), action: "backup.failed", detail: result.error });
        return;
      }
      await audit({ actorType: "telegram", actorId: String(chatId), action: "backup.created", target: result.meta?.path, detail: `${result.meta?.keys} keys` });
      await sendMessage(
        chatId,
        card([
          "<b>Backup created</b>",
          RULE,
          `keys     ${result.meta?.keys}`,
          `size     ${((result.meta?.bytes || 0) / 1024).toFixed(1)} KB`,
          `file     <code>${esc(result.meta?.path)}</code>`,
          `checksum <code>${esc(result.meta?.sha256.slice(0, 16))}…</code>`,
        ]),
        S.backupKeyboard(),
      );
      return;
    }
    case "/backupstatus":
      await sendMessage(chatId, await S.backupScreen(), S.backupKeyboard());
      return;
    case "/audit":
      await sendMessage(chatId, await S.auditScreen(), [[{ text: "Menu", callback_data: "m:menu" }]]);
      return;
    default:
      await sendMessage(chatId, `Unknown command ${esc(command)}. Type /help.`, S.mainMenu());
  }
}

function providerName(): string {
  return "bangunweb";
}

async function resolveUser(reference: string | undefined): Promise<RawUser | null> {
  if (!reference) return null;
  if (/^[0-9a-f-]{36}$/i.test(reference)) return getUserById(reference);
  return getUserByUsername(reference.replace(/^@/, ""));
}

async function sendUserPicker(chatId: ChatId, title: string): Promise<void> {
  const users = await listUsers();
  if (users.length === 0) {
    await sendMessage(chatId, "No accounts yet. Use /adduser.");
    return;
  }
  await sendMessage(
    chatId,
    `<b>${esc(title)}</b>`,
    users.slice(0, 20).map((user) => [{ text: user.username, callback_data: `u:info:${user.id}` }]).concat([[{ text: "Menu", callback_data: "m:menu" }]]),
  );
}

async function setUserStatus(chatId: ChatId, user: RawUser, status: "active" | "banned"): Promise<void> {
  if (status === "banned" && user.role === "admin" && (await adminCount()) <= 1) {
    await sendMessage(chatId, "That is the last active admin. Promote another account first.");
    return;
  }
  await setStatus(user.id, status);
  await audit({
    actorType: "telegram",
    actorId: String(chatId),
    action: status === "banned" ? "user.banned" : "user.unbanned",
    target: user.username,
    detail: `id ${shortId(user.id)}`,
  });
  const fresh = await getUserById(user.id);
  await sendMessage(
    chatId,
    card([
      `<b>${esc(user.username)}</b> is now ${status === "banned" ? "banned" : "active"}`,
      RULE,
      status === "banned" ? "Existing sessions are invalid on the next request." : "The account can sign in again.",
    ]),
    fresh ? S.userKeyboard(fresh) : S.mainMenu(),
  );
}

async function confirmDeleteUser(chatId: ChatId, user: RawUser): Promise<void> {
  if (user.role === "admin" && (await adminCount()) <= 1) {
    await sendMessage(chatId, "That is the last active admin. Promote another account first.");
    return;
  }
  const stats = await userStats(user.id);
  await sendMessage(
    chatId,
    card([
      "<b>Delete this account?</b>",
      RULE,
      `username  ${esc(user.username)}`,
      `role      ${user.role}`,
      `projects  ${stats.projects}`,
      `messages  ${stats.messages}`,
      RULE,
      "The account is removed immediately. Conversations stay in the database unless you ask for them to be purged too.",
    ]),
    [
      [
        { text: "Delete account", callback_data: `c:u:${user.id}` },
        { text: "Delete + purge chats", callback_data: `c:up:${user.id}` },
      ],
      [{ text: "Cancel", callback_data: "f:no" }],
    ],
  );
}

async function startPasswordReset(chatId: ChatId, user: RawUser): Promise<void> {
  await clearFlow(chatId);
  await writeFlow(chatId, { kind: "resetpassword", step: "password", userId: user.id, username: user.username });
  await sendMessage(
    chatId,
    card([
      `<b>Reset password · ${esc(user.username)}</b>`,
      RULE,
      "Send the new password (min 8 chars, letters plus a number or symbol).",
      "It is hashed before it is stored, and every existing session of that account is revoked.",
    ]),
    [[{ text: "Cancel", callback_data: "f:no" }]],
  );
}

/* ---------------------------------- flows --------------------------------- */

/** A share title is one line: newlines and runs of spaces are collapsed before saving. */
function cleanMeta(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

const META_LIMITS = { title: { min: 3, max: 80 }, description: { min: 10, max: 200 } } as const;

async function saveSiteMeta(chatId: ChatId, field: "title" | "description", raw: string): Promise<void> {
  const value = cleanMeta(raw);
  const limit = META_LIMITS[field];
  if (value.length < limit.min || value.length > limit.max) {
    await sendMessage(
      chatId,
      card([
        `<b>Not saved</b>`,
        RULE,
        `The ${field} must be ${limit.min}-${limit.max} characters. Yours is ${value.length}.`,
        "Send another one, or /cancel.",
      ]),
      [[{ text: "Cancel", callback_data: "f:no" }]],
    );
    return;
  }
  await writeSettings(field === "title" ? { siteTitle: value } : { siteDescription: value }, `telegram:${chatId}`);
  await audit({
    actorType: "telegram",
    actorId: String(chatId),
    action: "site.meta",
    target: field,
    detail: `${value.length} chars`,
  });
  await clearFlow(chatId);
  await sendMessage(chatId, card([`<b>Saved</b>`, RULE, `The link ${field} is now:`, esc(value)]));
  const screen = await S.siteMetaScreen();
  await sendMessage(chatId, screen.text, screen.keyboard);
}

async function handleFlowInput(chatId: ChatId, flow: Flow, text: string): Promise<void> {
  if (flow.kind === "sitemeta") {
    await saveSiteMeta(chatId, flow.field, text);
    return;
  }
  if (flow.kind === "adduser") {
    if (flow.step === "username") {
      const problem = usernameProblemFn(text);
      if (problem) {
        await sendMessage(chatId, esc(problem));
        return;
      }
      const exists = await getUserByUsername(text);
      if (exists) {
        await sendMessage(chatId, `Username "${esc(text)}" is already taken. Send another one.`);
        return;
      }
      await writeFlow(chatId, { ...flow, step: "password", username: text });
      await sendMessage(chatId, card([`Username <code>${esc(text)}</code> is free.`, "Now send the password for this account."]));
      return;
    }
    if (flow.step === "password") {
      const { passwordProblem } = await import("@/lib/auth/bcrypt");
      const problem = passwordProblem(text);
      if (problem) {
        await sendMessage(chatId, esc(problem));
        return;
      }
      const hash = await hashPasswordForFlow(text);
      await writeFlow(chatId, { ...flow, step: "confirm", hash });
      // The message that carried the password is deleted when Telegram allows it.
      await sendMessage(
        chatId,
        card([
          "<b>Create this account?</b>",
          RULE,
          `username  ${esc(flow.username || "")}`,
          "role      user",
          "status    active",
          RULE,
          "The password is already hashed; it is not stored anywhere in readable form.",
        ]),
        [
          [
            { text: "Create account", callback_data: "f:yes" },
            { text: "Cancel", callback_data: "f:no" },
          ],
        ],
      );
      return;
    }
  }

  if (flow.kind === "resetpassword" && flow.step === "password") {
    const { passwordProblem } = await import("@/lib/auth/bcrypt");
    const problem = passwordProblem(text);
    if (problem) {
      await sendMessage(chatId, esc(problem));
      return;
    }
    const hash = await hashPasswordForFlow(text);
    await writeFlow(chatId, { ...flow, step: "confirm", hash });
    await sendMessage(
      chatId,
      card([`<b>Set a new password for ${esc(flow.username)}?</b>`, RULE, "Every active session of that account will end."]),
      [
        [
          { text: "Set password", callback_data: "f:yes" },
          { text: "Cancel", callback_data: "f:no" },
        ],
      ],
    );
    return;
  }

  if (flow.kind === "renameuser") {
    const problem = usernameProblemFn(text);
    if (problem) {
      await sendMessage(chatId, esc(problem));
      return;
    }
    const { renameUser } = await import("@/lib/db/users");
    const result = await renameUser(flow.userId, text);
    if (result.error) {
      await sendMessage(chatId, esc(result.error));
      return;
    }
    await clearFlow(chatId);
    await audit({ actorType: "telegram", actorId: String(chatId), action: "user.renamed", target: text, detail: `id ${shortId(flow.userId)}` });
    const user = await getUserById(flow.userId);
    await sendMessage(chatId, `Renamed to <b>${esc(text)}</b>.`, user ? S.userKeyboard(user) : S.mainMenu());
    return;
  }

  if (flow.kind === "addtoken") {
    if (flow.step === "provider") {
      await writeFlow(chatId, { ...flow, step: "key", provider: text.trim().toLowerCase() });
      await sendMessage(chatId, card(["<b>Step 2 of 3</b>", RULE, "Send the API key. It is encrypted immediately and never shown again in full."]));
      return;
    }
    if (flow.step === "key") {
      if (text.length < 12) {
        await sendMessage(chatId, "That looks too short for an API key. Send it again.");
        return;
      }
      let sealed;
      try {
        sealed = sealSecret(text);
      } catch {
        await sendMessage(chatId, "Server encryption key is missing, so the key cannot be stored safely.");
        return;
      }
      await writeFlow(chatId, {
        ...flow,
        step: "label",
        sealed,
        masked: maskSecret(text),
        fingerprint: fingerprint(text),
      });
      await sendMessage(
        chatId,
        card([
          `<b>Key received: <code>${esc(maskSecret(text))}</code></b>`,
          RULE,
          "Step 3 of 3: send a label for this key (for example \"primary router\"), or press Skip.",
        ]),
        [[{ text: "Skip label", callback_data: "f:skiplabel" }]],
      );
      return;
    }
    if (flow.step === "label") {
      await writeFlow(chatId, { ...flow, step: "confirm", label: text.slice(0, 60) });
      await sendConfirmKey(chatId, { ...flow, step: "confirm", label: text.slice(0, 60) });
      return;
    }
  }

  await sendMessage(chatId, "Send /cancel first, then start again.", S.mainMenu());
}

async function sendConfirmKey(chatId: ChatId, flow: Extract<Flow, { kind: "addtoken" }>): Promise<void> {
  await sendMessage(
    chatId,
    card([
      "<b>Save this key?</b>",
      RULE,
      `provider  ${esc(flow.provider || "bangunweb")}`,
      `key       <code>${esc(flow.masked || "")}</code>`,
      `label     ${esc(flow.label || "no label")}`,
      RULE,
      "Stored encrypted with AES-256-GCM. The plaintext is never written to the database.",
    ]),
    [
      [
        { text: "Save key", callback_data: "f:yes" },
        { text: "Cancel", callback_data: "f:no" },
      ],
    ],
  );
}

async function finalizeFlow(chatId: ChatId, flow: Flow): Promise<void> {
  if (flow.kind === "sitemeta") return;
  if (flow.kind === "adduser" && flow.step === "confirm" && flow.username && flow.hash) {
    const created = await createUserWithHash({ username: flow.username, hash: flow.hash, role: "user", createdBy: `telegram:${chatId}` });
    await clearFlow(chatId);
    if ("error" in created) {
      await sendMessage(chatId, esc(created.error), S.mainMenu());
      return;
    }
    await audit({ actorType: "telegram", actorId: String(chatId), action: "user.created", target: created.user.username, detail: `id ${shortId(created.user.id)}` });
    const fresh = await getUserById(created.user.id);
    await sendMessage(
      chatId,
      card([
        `<b>Account created</b>`,
        RULE,
        `username  <code>${esc(created.user.username)}</code>`,
        `role      ${created.user.role}`,
        `id        <code>${esc(created.user.id)}</code>`,
        RULE,
        `The user can sign in at ${PANEL_URL.replace(/^https?:\/\//, "")} right now.`,
      ]),
      fresh ? S.userKeyboard(fresh) : S.mainMenu(),
    );
    return;
  }

  if (flow.kind === "resetpassword" && flow.step === "confirm" && flow.hash) {
    await setPasswordHash(flow.userId, flow.hash);
    await clearFlow(chatId);
    await audit({ actorType: "telegram", actorId: String(chatId), action: "user.password_reset", target: flow.username, detail: `id ${shortId(flow.userId)}` });
    await sendMessage(chatId, `Password updated for <b>${esc(flow.username)}</b>. Old sessions are invalid now.`, S.mainMenu());
    return;
  }

  if (flow.kind === "addtoken" && flow.step === "confirm" && flow.sealed && flow.masked && flow.fingerprint) {
    const created = await addSealedApiKey({
      provider: flow.provider || "bangunweb",
      label: flow.label || "",
      sealed: flow.sealed,
      fingerprint: flow.fingerprint,
      masked: flow.masked,
      addedBy: `telegram:${chatId}`,
    });
    await clearFlow(chatId);
    if ("error" in created) {
      await sendMessage(chatId, esc(created.error), S.mainMenu());
      return;
    }
    await audit({ actorType: "telegram", actorId: String(chatId), action: "apikey.added", target: created.key.masked, detail: created.key.active ? "active" : "inactive" });
    await sendMessage(
      chatId,
      card([
        "<b>Key saved</b>",
        RULE,
        `<code>${esc(created.key.masked)}</code>${created.key.active ? " · ACTIVE" : ""}`,
        created.key.active ? "The app uses it on the next request." : "Activate it with /changetoken.",
      ]),
      S.keyKeyboard(created.key),
    );
    return;
  }

  await clearFlow(chatId);
  await sendMessage(chatId, "That conversation expired. Start again with /help.", S.mainMenu());
}

/* -------------------------------- callbacks ------------------------------- */

async function handleCallback(cb: NonNullable<Update["callback_query"]>): Promise<void> {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const messageId = cb.message?.message_id;

  if (!isTelegramAdmin(cb.from.id)) {
    await recordRejection(cb.from.id, cb.from.username, `callback:${cb.data || ""}`);
    await answerCallback(cb.id, "Not authorised.", true);
    return;
  }
  await answerCallback(cb.id);
  const data = cb.data || "";
  const [scope, action, id, extra] = data.split(":");

  const render = async (text: string, keyboard?: InlineButton[][]) => {
    if (messageId) await editMessage(chatId, messageId, text, keyboard);
    else await sendMessage(chatId, text, keyboard);
  };

  if (scope === "m") {
    if (action === "menu") return render(S.welcome("aomi"), S.mainMenu());
    if (action === "help") return render(S.help(), S.mainMenu());
    if (action === "users") {
      const screen = await S.usersList();
      return render(screen.text, screen.keyboard);
    }
    if (action === "keys") {
      const screen = await S.keysList();
      return render(screen.text, screen.keyboard);
    }
    if (action === "stats") return render(await S.stats(), S.mainMenu());
    if (action === "db") return render(await S.database(), S.mainMenu());
    if (action === "backup") return render(await S.backupScreen(), S.backupKeyboard());
    if (action === "audit") return render(await S.auditScreen(), [[{ text: "Menu", callback_data: "m:menu" }]]);
    return;
  }

  if (scope === "f") {
    if (action === "no") {
      await clearFlow(chatId);
      return render("Cancelled. Nothing was changed.", S.mainMenu());
    }
    if (action === "yes") {
      const flow = await readFlow(chatId);
      if (!flow) return render("That conversation expired. Start again with /help.", S.mainMenu());
      return finalizeFlow(chatId, flow);
    }
    if (action === "skiplabel") {
      const flow = await readFlow(chatId);
      if (!flow || flow.kind !== "addtoken") return render("That conversation expired.", S.mainMenu());
      const next = { ...flow, step: "confirm" as const, label: "" };
      await writeFlow(chatId, next);
      return sendConfirmKey(chatId, next);
    }
    if (action === "provider") {
      const flow = await readFlow(chatId);
      if (!flow || flow.kind !== "addtoken") return render("That conversation expired.", S.mainMenu());
      await writeFlow(chatId, { ...flow, step: "key", provider: providerName() });
      return render(card(["<b>Step 2 of 3</b>", RULE, "Send the API key. It is encrypted immediately and never shown again in full."]));
    }
    return;
  }

  if (scope === "sm") {
    if (action === "title" || action === "desc") {
      const field = action === "title" ? "title" : "description";
      await clearFlow(chatId);
      await writeFlow(chatId, { kind: "sitemeta", field });
      return render(
        card(
          field === "title"
            ? ["<b>New link title</b>", RULE, "Send the title to use, 3-80 characters."]
            : ["<b>New link description</b>", RULE, "Send the description to use, 10-200 characters."],
        ),
        [[{ text: "Cancel", callback_data: "f:no" }]],
      );
    }
    if (action === "reset") {
      await clearFlow(chatId);
      await writeSettings({ siteTitle: SITE_META_DEFAULTS.title, siteDescription: SITE_META_DEFAULTS.description }, `telegram:${chatId}`);
      await audit({ actorType: "telegram", actorId: String(chatId), action: "site.meta", target: "defaults", detail: "title and description reset" });
      const screen = await S.siteMetaScreen();
      return render(screen.text, screen.keyboard);
    }
    return;
  }

  if (scope === "u") {
    if (action === "new") {
      await clearFlow(chatId);
      await writeFlow(chatId, { kind: "adduser", step: "username" });
      return render(card(["<b>New account · step 1 of 3</b>", RULE, "Send the username (3-32 chars: letters, digits, dot, dash, underscore)."]), [[{ text: "Cancel", callback_data: "f:no" }]]);
    }
    const user = await getUserById(id);
    if (!user) return render("That account no longer exists.", S.mainMenu());
    if (action === "info") return render(S.userCard(user, await userStats(user.id)), S.userKeyboard(user));
    if (action === "ban") return setUserStatus(chatId, user, "banned");
    if (action === "unban") return setUserStatus(chatId, user, "active");
    if (action === "reset") return startPasswordReset(chatId, user);
    if (action === "rename") {
      await clearFlow(chatId);
      await writeFlow(chatId, { kind: "renameuser", step: "username", userId: user.id });
      return render(card([`<b>Rename ${esc(user.username)}</b>`, RULE, "Send the new username."]), [[{ text: "Cancel", callback_data: "f:no" }]]);
    }
    if (action === "role") {
      const role = extra === "admin" ? "admin" : "user";
      if (role === "user" && user.role === "admin" && (await adminCount()) <= 1) {
        return render("That is the last active admin. Promote another account first.", S.userKeyboard(user));
      }
      await setRole(user.id, role);
      await audit({ actorType: "telegram", actorId: String(chatId), action: "user.role_changed", target: user.username, detail: role });
      const fresh = await getUserById(user.id);
      return render(
        card([`<b>${esc(user.username)}</b> is now ${role}`, RULE, role === "admin" ? "Full access to the panel and this bot." : "Normal access, only their own projects."]),
        fresh ? S.userKeyboard(fresh) : S.mainMenu(),
      );
    }
    if (action === "del") return confirmDeleteUser(chatId, user);
    return;
  }

  if (scope === "c") {
    if (action === "u" || action === "up") {
      const user = await getUserById(id);
      if (!user) return render("That account no longer exists.", S.mainMenu());
      if (user.role === "admin" && (await adminCount()) <= 1) {
        return render("That is the last active admin. Promote another account first.", S.userKeyboard(user));
      }
      const deleted = await deleteUserRecord(user.id, action === "up");
      if (deleted.error) return render(esc(deleted.error), S.mainMenu());
      return render(
        card([
          `<b>${esc(user.username)} deleted</b>`,
          RULE,
          action === "up" ? `Conversations purged: ${deleted.purged} project(s).` : "Conversation history was kept in the database.",
          "The account can no longer sign in.",
        ]),
        [[{ text: "All users", callback_data: "m:users" }]],
      );
    }
    if (action === "k") {
      const key = await getApiKey(id);
      if (!key) return render("That key no longer exists.", S.mainMenu());
      const removed = await deleteApiKey(id);
      if (removed.error) return render(esc(removed.error), S.mainMenu());
      await audit({ actorType: "telegram", actorId: String(chatId), action: "apikey.deleted", target: key.masked, detail: removed.wasActive ? "was active" : "was inactive" });
      const screen = await S.keysList();
      return render(card([`<b>Key ${esc(key.masked)} deleted</b>`, RULE, removed.wasActive ? "Another active key was promoted, or the env fallback applies." : ""]) + "\n" + screen.text, screen.keyboard);
    }
    return;
  }

  if (scope === "k") {
    const key = await getApiKey(id);
    if (!key) return render("That key no longer exists.", S.mainMenu());
    if (action === "info") return render(S.keyCard(key), S.keyKeyboard(key));
    if (action === "use") {
      const result = await setActiveKey(id);
      if (result.error) return render(esc(result.error), S.keyKeyboard(key));
      await audit({ actorType: "telegram", actorId: String(chatId), action: "apikey.activated", target: key.masked });
      const fresh = await getApiKey(id);
      return render(
        card([`<b>${esc(key.masked)} is now active</b>`, RULE, "The web app uses it on the next request. No redeploy needed."]),
        fresh ? S.keyKeyboard(fresh) : S.mainMenu(),
      );
    }
    if (action === "del") {
      return render(
        card([
          "<b>Delete this key?</b>",
          RULE,
          `<code>${esc(key.masked)}</code> · ${esc(key.label || "no label")}`,
          key.active ? "This is the ACTIVE key. The env fallback applies after deletion." : "",
        ]),
        [
          [
            { text: "Delete key", callback_data: `c:k:${id}` },
            { text: "Cancel", callback_data: "f:no" },
          ],
        ],
      );
    }
    if (action === "on" || action === "off") {
      const status = action === "on" ? "active" : "disabled";
      const result = await toggleApiKey(id, status);
      if (result.error) return render(esc(result.error), S.keyKeyboard(key));
      await audit({ actorType: "telegram", actorId: String(chatId), action: `apikey.${status === "active" ? "enabled" : "disabled"}`, target: key.masked });
      const fresh = await getApiKey(id);
      return render(card([`<b>${esc(key.masked)}</b> is now ${status}`]), fresh ? S.keyKeyboard(fresh) : S.mainMenu());
    }
    if (action === "check") {
      const check = await checkKey(id);
      const fresh = await getApiKey(id);
      return render(
        card([
          `<b>Test ${esc(key.masked)}</b>`,
          RULE,
          check.ok ? `ok · ${check.models ?? 0} models reachable` : "failed",
          check.message ? esc(check.message) : "",
        ]),
        fresh ? S.keyKeyboard(fresh) : S.mainMenu(),
      );
    }
    return;
  }

  if (scope === "b") {
    if (action === "now") {
      await render("Creating an encrypted snapshot…");
      const result = await createBackup(`telegram:${chatId}`);
      if (result.error) {
        await sendMessage(chatId, `Backup failed: ${esc(result.error)}`);
        return;
      }
      await audit({ actorType: "telegram", actorId: String(chatId), action: "backup.created", target: result.meta?.path, detail: `${result.meta?.keys} keys` });
      await sendMessage(
        chatId,
        card([
          "<b>Backup created</b>",
          RULE,
          `keys ${result.meta?.keys} · ${((result.meta?.bytes || 0) / 1024).toFixed(1)} KB`,
          `<code>${esc(result.meta?.path)}</code>`,
        ]),
        S.backupKeyboard(),
      );
      return;
    }
    if (action === "list") {
      const files = await listBackupFiles();
      if (files.length === 0) return render("No backup files in the private repo yet.", S.backupKeyboard());
      return render(
        card(["<b>Backup files</b>", RULE, files.slice(0, 10).map((file, index) => `${index + 1}. <code>${esc(file.name)}</code> · ${(file.size / 1024).toFixed(1)} KB`).join("\n")]),
        S.backupKeyboard(),
      );
    }
    return;
  }
}

async function checkKey(id: string): Promise<{ ok: boolean; models?: number; message?: string }> {
  const plain = await decryptKey(id);
  if (!plain) {
    await recordKeyCheck(id, false);
    return { ok: false, message: "Key cannot be decrypted." };
  }
  try {
    const response = await fetch(`${aiConfig.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${plain}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.text();
      await recordKeyCheck(id, false);
      return { ok: false, message: `HTTP ${response.status}: ${body.slice(0, 120)}` };
    }
    const payload = (await response.json()) as { data?: unknown[] };
    await recordKeyCheck(id, true);
    return { ok: true, models: payload.data?.length ?? 0 };
  } catch (error) {
    await recordKeyCheck(id, false);
    return { ok: false, message: error instanceof Error ? error.message : "network error" };
  }
}

async function deleteUserRecord(userId: string, purge: boolean): Promise<{ error?: string; purged: number }> {
  const { deleteUser } = await import("@/lib/db/users");
  const removed = await deleteUser(userId);
  if (removed.error) return { error: removed.error, purged: 0 };
  const purged = purge ? await purgeUserProjects(userId) : 0;
  return { purged };
}

export { adminIds, clip };
