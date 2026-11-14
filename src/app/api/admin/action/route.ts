/**
 * Every mutation the panel can perform, in one place.
 *
 * One guarded entry point keeps authorisation and the audit trail impossible to forget:
 * each branch writes through the same stores the Telegram bot uses, and each one records
 * who did what.
 */
import { z } from "zod";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { requireAdmin, sameOrigin } from "@/lib/auth/require";
import { passwordProblem, usernameProblem } from "@/lib/auth/bcrypt";
import { adminCount, createUser, deleteUser, getUserById, renameUser, setPassword, setRole, setStatus } from "@/lib/db/users";
import { addApiKey, deleteApiKey, getApiKey, setActiveKey, toggleApiKey } from "@/lib/db/apikeys";
import { purgeUserProjects } from "@/lib/db/projects";
import { audit } from "@/lib/db/audit";
import { createBackup } from "@/lib/db/backup";
import { writeSettings } from "@/lib/db/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createUser"),
    username: z.string().min(3).max(32),
    password: z.string().min(8).max(200),
    role: z.enum(["admin", "user"]).default("user"),
  }),
  z.object({ action: z.literal("setRole"), userId: z.string(), role: z.enum(["admin", "user"]) }),
  z.object({ action: z.literal("setStatus"), userId: z.string(), status: z.enum(["active", "banned"]) }),
  z.object({ action: z.literal("resetPassword"), userId: z.string(), password: z.string().min(8).max(200) }),
  z.object({ action: z.literal("renameUser"), userId: z.string(), username: z.string().min(3).max(32) }),
  z.object({ action: z.literal("deleteUser"), userId: z.string(), purge: z.boolean().default(false) }),
  z.object({
    action: z.literal("addKey"),
    label: z.string().max(60).default(""),
    key: z.string().min(12).max(400),
    provider: z.string().max(40).default("bangunweb"),
  }),
  z.object({ action: z.literal("activateKey"), keyId: z.string() }),
  z.object({ action: z.literal("toggleKey"), keyId: z.string(), status: z.enum(["active", "disabled"]) }),
  z.object({ action: z.literal("deleteKey"), keyId: z.string() }),
  z.object({ action: z.literal("backupNow") }),
  z.object({
    action: z.literal("updateSettings"),
    defaultModel: z.string().max(80).optional(),
    retentionMessages: z.number().int().min(10).max(400).optional(),
  }),
]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origin tidak diizinkan.", 403);

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  const actor = gate.account.user;
  const actorId = `${actor.id} (${actor.username})`;
  const input = parsed.data;

  try {
    switch (input.action) {
      case "createUser": {
        const nameProblem = usernameProblem(input.username);
        if (nameProblem) return errorResponse(nameProblem, 400);
        const passProblem = passwordProblem(input.password);
        if (passProblem) return errorResponse(passProblem, 400);
        const created = await createUser({ username: input.username, password: input.password, role: input.role, createdBy: `web:${actorId}` });
        if ("error" in created) return errorResponse(created.error, 409);
        await audit({ actorType: "user", actorId, action: "user.created", target: created.user.username, detail: `via panel · ${input.role}` });
        return json({ ok: true, user: created.user });
      }
      case "setRole": {
        const target = await getUserById(input.userId);
        if (!target) return errorResponse("User tidak ditemukan.", 404);
        if (target.role === "admin" && input.role === "user" && (await adminCount()) <= 1) {
          return errorResponse("Ini admin aktif terakhir.", 409);
        }
        await setRole(input.userId, input.role);
        await audit({ actorType: "user", actorId, action: "user.role_changed", target: target.username, detail: input.role });
        return json({ ok: true });
      }
      case "setStatus": {
        const target = await getUserById(input.userId);
        if (!target) return errorResponse("User tidak ditemukan.", 404);
        if (input.status === "banned" && target.role === "admin" && (await adminCount()) <= 1) {
          return errorResponse("Ini admin aktif terakhir.", 409);
        }
        await setStatus(input.userId, input.status);
        await audit({ actorType: "user", actorId, action: input.status === "banned" ? "user.banned" : "user.unbanned", target: target.username });
        return json({ ok: true });
      }
      case "resetPassword": {
        const target = await getUserById(input.userId);
        if (!target) return errorResponse("User tidak ditemukan.", 404);
        const passProblem = passwordProblem(input.password);
        if (passProblem) return errorResponse(passProblem, 400);
        await setPassword(input.userId, input.password);
        await audit({ actorType: "user", actorId, action: "user.password_reset", target: target.username });
        return json({ ok: true });
      }
      case "renameUser": {
        const nameProblem = usernameProblem(input.username);
        if (nameProblem) return errorResponse(nameProblem, 400);
        const result = await renameUser(input.userId, input.username);
        if (result.error) return errorResponse(result.error, 409);
        await audit({ actorType: "user", actorId, action: "user.renamed", target: input.username });
        return json({ ok: true });
      }
      case "deleteUser": {
        const target = await getUserById(input.userId);
        if (!target) return errorResponse("User tidak ditemukan.", 404);
        if (target.role === "admin" && (await adminCount()) <= 1) return errorResponse("Ini admin aktif terakhir.", 409);
        const removed = await deleteUser(input.userId);
        if (removed.error) return errorResponse(removed.error, 400);
        const purged = input.purge ? await purgeUserProjects(input.userId) : 0;
        await audit({
          actorType: "user",
          actorId,
          action: "user.deleted",
          target: target.username,
          detail: purged ? `${purged} project(s) purged` : "history kept",
        });
        return json({ ok: true, purged });
      }
      case "addKey": {
        const created = await addApiKey({ label: input.label, key: input.key, provider: input.provider, addedBy: `web:${actorId}` });
        if ("error" in created) return errorResponse(created.error, 400);
        await audit({ actorType: "user", actorId, action: "apikey.added", target: created.key.masked });
        return json({ ok: true, key: created.key });
      }
      case "activateKey": {
        const key = await getApiKey(input.keyId);
        if (!key) return errorResponse("Kunci tidak ditemukan.", 404);
        const result = await setActiveKey(input.keyId);
        if (result.error) return errorResponse(result.error, 400);
        await audit({ actorType: "user", actorId, action: "apikey.activated", target: key.masked });
        return json({ ok: true });
      }
      case "toggleKey": {
        const key = await getApiKey(input.keyId);
        if (!key) return errorResponse("Kunci tidak ditemukan.", 404);
        const result = await toggleApiKey(input.keyId, input.status);
        if (result.error) return errorResponse(result.error, 400);
        await audit({ actorType: "user", actorId, action: `apikey.${input.status === "active" ? "enabled" : "disabled"}`, target: key.masked });
        return json({ ok: true });
      }
      case "deleteKey": {
        const key = await getApiKey(input.keyId);
        if (!key) return errorResponse("Kunci tidak ditemukan.", 404);
        const removed = await deleteApiKey(input.keyId);
        if (removed.error) return errorResponse(removed.error, 400);
        await audit({ actorType: "user", actorId, action: "apikey.deleted", target: key.masked, detail: removed.wasActive ? "was active" : "" });
        return json({ ok: true });
      }
      case "backupNow": {
        const result = await createBackup(`web:${actorId}`);
        if (result.error) {
          await audit({ actorType: "user", actorId, action: "backup.failed", detail: result.error });
          return errorResponse(result.error, 500);
        }
        await audit({ actorType: "user", actorId, action: "backup.created", target: result.meta?.path, detail: `${result.meta?.keys} keys` });
        return json({ ok: true, backup: result.meta });
      }
      case "updateSettings": {
        const next = await writeSettings(
          {
            ...(input.defaultModel ? { defaultModel: input.defaultModel } : {}),
            ...(input.retentionMessages ? { retentionMessages: input.retentionMessages } : {}),
          },
          actorId,
        );
        await audit({ actorType: "user", actorId, action: "settings.updated", detail: JSON.stringify({ defaultModel: next.defaultModel }) });
        return json({ ok: true, settings: next });
      }
    }
  } catch (error) {
    return serverError(error);
  }
}
