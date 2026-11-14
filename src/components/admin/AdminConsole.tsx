"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Database, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  username: string;
  role: "admin" | "user";
  status: "active" | "banned";
  createdAt: string;
  lastLoginAt: string | null;
  createdBy: string;
  stats: { chats: number; messages: number; lastActiveAt: string | null; projects: number };
}

interface AdminKey {
  id: string;
  masked: string;
  label: string;
  provider: string;
  status: "active" | "disabled";
  active: boolean;
  addedAt: string;
  addedBy: string;
  lastUsedAt: string | null;
}

interface AuditRow {
  id: string;
  at: string;
  actorType: string;
  actorId: string;
  action: string;
  target?: string;
  detail?: string;
}

interface Overview {
  me: { id: string; username: string; role: string };
  users: AdminUser[];
  keys: AdminKey[];
  audit: AuditRow[];
  counters: { users: number; projects: number; messages: number; keys: number };
  backup: { last: { createdAt: string; keys: number; path: string; sha256: string } | null; files: number; configured: boolean; encryption: boolean };
  settings: { defaultModel: string; retentionMessages: number };
  database: { configured: boolean; ok: boolean; latencyMs: number; error?: string; encryption: boolean };
}

type Tab = "users" | "keys" | "activity" | "system";

const TABS: { id: Tab; label: string }[] = [
  { id: "users", label: "Accounts" },
  { id: "keys", label: "Provider keys" },
  { id: "activity", label: "Activity" },
  { id: "system", label: "System" },
];

function fmt(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AdminConsole() {
  const [tab, setTab] = useState<Tab>("users");
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Could not load the panel.");
      setData(payload as Overview);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the panel.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || "That action was refused.");
        setNotice("Saved. The change is live now.");
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That action was refused.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const totals = useMemo(() => {
    if (!data) return null;
    const active = data.users.filter((user) => user.status === "active").length;
    const admins = data.users.filter((user) => user.role === "admin" && user.status === "active").length;
    return { active, admins };
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Control panel</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink">Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]",
              data?.database.ok ? "border-line text-muted" : "border-line text-ink",
            )}
          >
            <Database className="size-3.5" aria-hidden />
            {data?.database.ok ? `Upstash ${data.database.latencyMs} ms` : "Database down"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted">
            <ShieldCheck className="size-3.5" aria-hidden />
            {data?.database.encryption ? "AES-256-GCM" : "encryption key missing"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-ink"
            aria-label="Reload"
          >
            <RefreshCw className="size-3.5" aria-hidden />
          </button>
        </div>
      </header>

      {error ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-ink">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-muted">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Accounts", value: data?.users.length ?? 0, hint: totals ? `${totals.active} active · ${totals.admins} admin` : "" },
          { label: "Projects", value: data?.counters.projects ?? 0, hint: "persisted" },
          { label: "Messages", value: data?.counters.messages ?? 0, hint: "cloud history" },
          { label: "Keys", value: data?.keys.length ?? 0, hint: "encrypted at rest" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-panel px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-faint">{item.label}</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none text-ink">{item.value}</p>
            <p className="mt-1.5 text-[11.5px] text-faint">{item.hint}</p>
          </div>
        ))}
      </section>

      <div role="tablist" aria-label="Admin sections" className="mt-7 flex gap-1 border-b border-line">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              "-mb-px border-b px-3 py-2 text-[12.5px] transition-colors",
              tab === entry.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "users" ? <UsersTab data={data} busy={busy} act={act} /> : null}
        {tab === "keys" ? <KeysTab data={data} busy={busy} act={act} /> : null}
        {tab === "activity" ? <ActivityTab data={data} /> : null}
        {tab === "system" ? <SystemTab data={data} busy={busy} act={act} /> : null}
      </div>
    </div>
  );
}

type Act = (key: string, body: Record<string, unknown>) => Promise<void>;

function UsersTab({ data, busy, act }: { data: Overview | null; busy: string | null; act: Act }) {
  const [form, setForm] = useState({ username: "", password: "", role: "user" as "user" | "admin" });
  const [reset, setReset] = useState<{ id: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!data) return <Skeleton />;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="rounded-xl border border-line bg-panel p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void act("create", { action: "createUser", username: form.username, password: form.password, role: form.role }).then(() =>
            setForm({ username: "", password: "", role: "user" }),
          );
        }}
      >
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <Users className="size-4" aria-hidden /> New account
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_130px_auto]">
          <input
            required
            minLength={3}
            maxLength={32}
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            placeholder="username"
            aria-label="Username"
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          />
          <input
            required
            minLength={8}
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="password (min 8)"
            aria-label="Password"
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          />
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as "user" | "admin" })}
            aria-label="Role"
            className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button
            type="submit"
            disabled={busy === "create"}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-ink disabled:opacity-60"
          >
            {busy === "create" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Create
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-faint">The password is hashed with bcrypt before it is stored. The account can sign in immediately.</p>
      </form>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Usage</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Last login</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2.5">
                  <p className="text-[13px] text-ink">{user.username}</p>
                  <p className="text-[11px] text-faint">{user.createdBy}</p>
                </td>
                <td className="px-3 py-2.5 text-[12.5px] text-muted">{user.role}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      user.status === "active" ? "border-line text-muted" : "border-line text-ink",
                    )}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 text-[12px] tabular-nums text-muted sm:table-cell">
                  {user.stats.projects} proj · {user.stats.messages} msg
                </td>
                <td className="hidden px-3 py-2.5 text-[12px] text-muted md:table-cell">{fmt(user.lastLoginAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <MiniButton disabled={busy === `status:${user.id}`} onClick={() => void act(`status:${user.id}`, { action: "setStatus", userId: user.id, status: user.status === "active" ? "banned" : "active" })}>
                      {user.status === "active" ? "Ban" : "Unban"}
                    </MiniButton>
                    <MiniButton disabled={busy === `role:${user.id}`} onClick={() => void act(`role:${user.id}`, { action: "setRole", userId: user.id, role: user.role === "admin" ? "user" : "admin" })}>
                      {user.role === "admin" ? "Make user" : "Make admin"}
                    </MiniButton>
                    <MiniButton onClick={() => setReset({ id: user.id, value: "" })}>Reset password</MiniButton>
                    {confirmDelete === user.id ? (
                      <>
                        <MiniButton tone="danger" disabled={busy === `del:${user.id}`} onClick={() => void act(`del:${user.id}`, { action: "deleteUser", userId: user.id, purge: false })}>
                          Confirm delete
                        </MiniButton>
                        <MiniButton onClick={() => setConfirmDelete(null)}>Keep</MiniButton>
                      </>
                    ) : (
                      <MiniButton tone="danger" onClick={() => setConfirmDelete(user.id)}>
                        <Trash2 className="size-3" aria-hidden /> Delete
                      </MiniButton>
                    )}
                  </div>
                  {reset?.id === user.id ? (
                    <form
                      className="mt-2 flex items-center gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void act(`reset:${user.id}`, { action: "resetPassword", userId: user.id, password: reset.value }).then(() => setReset(null));
                      }}
                    >
                      <input
                        autoFocus
                        type="password"
                        minLength={8}
                        required
                        value={reset.value}
                        onChange={(event) => setReset({ id: user.id, value: event.target.value })}
                        placeholder="new password"
                        aria-label={`New password for ${user.username}`}
                        className="h-8 w-40 rounded-md border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-ink"
                      />
                      <MiniButton type="submit" disabled={busy === `reset:${user.id}`}>
                        Save
                      </MiniButton>
                      <MiniButton onClick={() => setReset(null)}>Cancel</MiniButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KeysTab({ data, busy, act }: { data: Overview | null; busy: string | null; act: Act }) {
  const [form, setForm] = useState({ label: "", key: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!data) return <Skeleton />;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="rounded-xl border border-line bg-panel p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void act("addkey", { action: "addKey", label: form.label, key: form.key }).then(() => setForm({ label: "", key: "" }));
        }}
      >
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <KeyRound className="size-4" aria-hidden /> Add a provider key
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[200px_1fr_auto]">
          <input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="label (optional)"
            aria-label="Key label"
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          />
          <input
            required
            minLength={12}
            type="password"
            autoComplete="off"
            value={form.key}
            onChange={(event) => setForm({ ...form, key: event.target.value })}
            placeholder="API key"
            aria-label="API key"
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy === "addkey"}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-ink disabled:opacity-60"
          >
            {busy === "addkey" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Store
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-faint">Encrypted with AES-256-GCM before it touches Redis. Only a mask is ever shown again.</p>
      </form>

      <ul className="flex flex-col gap-2">
        {data.keys.length === 0 ? <li className="rounded-xl border border-line px-3.5 py-3 text-[12.5px] text-muted">No key stored. The deployment env key is in use.</li> : null}
        {data.keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3.5 py-3">
            <div>
              <p className="text-[13px] text-ink">
                {key.masked}
                {key.active ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10.5px] text-accent-ink">active</span> : null}
              </p>
              <p className="mt-0.5 text-[11.5px] text-faint">
                {key.label || "no label"} · {key.status} · added {fmt(key.addedAt)} · used {fmt(key.lastUsedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {!key.active ? (
                <MiniButton disabled={busy === `act:${key.id}`} onClick={() => void act(`act:${key.id}`, { action: "activateKey", keyId: key.id })}>
                  Activate
                </MiniButton>
              ) : null}
              <MiniButton
                disabled={busy === `tog:${key.id}`}
                onClick={() => void act(`tog:${key.id}`, { action: "toggleKey", keyId: key.id, status: key.status === "active" ? "disabled" : "active" })}
              >
                {key.status === "active" ? "Disable" : "Enable"}
              </MiniButton>
              {confirmDelete === key.id ? (
                <>
                  <MiniButton tone="danger" disabled={busy === `delk:${key.id}`} onClick={() => void act(`delk:${key.id}`, { action: "deleteKey", keyId: key.id })}>
                    Confirm delete
                  </MiniButton>
                  <MiniButton onClick={() => setConfirmDelete(null)}>Keep</MiniButton>
                </>
              ) : (
                <MiniButton tone="danger" onClick={() => setConfirmDelete(key.id)}>
                  <Trash2 className="size-3" aria-hidden /> Delete
                </MiniButton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityTab({ data }: { data: Overview | null }) {
  if (!data) return <Skeleton />;
  if (data.audit.length === 0) return <p className="rounded-xl border border-line px-3.5 py-3 text-[12.5px] text-muted">Nothing recorded yet.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {data.audit.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 py-2.5">
          <p className="text-[12.5px] text-ink">
            {entry.action}
            {entry.target ? <span className="text-muted"> → {entry.target}</span> : null}
          </p>
          <p className="text-[11.5px] text-faint">
            {entry.actorType}/{entry.actorId.slice(0, 12)} · {fmt(entry.at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SystemTab({ data, busy, act }: { data: Overview | null; busy: string | null; act: Act }) {
  if (!data) return <Skeleton />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-[12.5px] font-medium text-ink">Database</p>
        <dl className="mt-2 space-y-1 text-[12px] text-muted">
          <div className="flex justify-between gap-3">
            <dt>Status</dt>
            <dd className="text-ink">{data.database.ok ? "connected" : "down"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Latency</dt>
            <dd className="text-ink tabular-nums">{data.database.latencyMs} ms</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Encryption</dt>
            <dd className="text-ink">{data.database.encryption ? "AES-256-GCM" : "missing"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Default model</dt>
            <dd className="text-ink">{data.settings.defaultModel}</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-[12.5px] font-medium text-ink">Backup</p>
        <p className="mt-1 text-[12px] text-muted">
          {data.backup.last ? `Last: ${fmt(data.backup.last.createdAt)} · ${data.backup.last.keys} keys` : "No snapshot yet."}
        </p>
        <p className="mt-1 text-[11.5px] text-faint">{data.backup.files} encrypted file(s) in the private repo.</p>
        <button
          type="button"
          disabled={busy === "backup"}
          onClick={() => void act("backup", { action: "backupNow" })}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-ink disabled:opacity-60"
        >
          {busy === "backup" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Back up now
        </button>
      </div>
    </div>
  );
}

function MiniButton({
  children,
  onClick,
  disabled,
  tone,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "danger";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[11.5px] transition-colors disabled:opacity-50",
        tone === "danger" ? "text-ink hover:bg-surface" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line px-3.5 py-3 text-[12.5px] text-muted">
      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading…
    </div>
  );
}
