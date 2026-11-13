"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionUser {
  username: string;
  role: "owner" | "member";
}

/** Who is signed in, plus the only way out of the session. */
export function AccountMenu({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { user?: SessionUser } | null) => {
        if (!cancelled && payload?.user) setUser(payload.user);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // The login screen still refuses a live cookie, so a failed call is not a lockout.
    }
    onNavigate?.();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", className)}>
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold uppercase text-ink-dim">
        {(user?.username ?? "a").slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{user?.username ?? "memuat…"}</span>
        <span className="block text-[10.5px] uppercase tracking-[0.1em] text-faint">{user?.role ?? " "}</span>
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        aria-label="Keluar dari akun"
        title="Keluar"
        className="grid size-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
