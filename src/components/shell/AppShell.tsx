"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The login screen is its own page: no sidebar, no mobile header.
  // Kept after every hook so the hook order never changes between renders.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-[13px] focus:text-accent-ink"
      >
        Lompat ke konten
      </a>

      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg px-4 lg:hidden">
        <a href="/chat" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-[9px] bg-accent text-[13px] font-semibold text-accent-ink">a</span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">aomi</span>
        </a>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Tutup menu" : "Buka menu"}
          className="rounded-lg border border-line p-2 text-muted transition-colors hover:text-ink"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 w-[248px] border-r border-line bg-panel shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <main id="main" className="min-w-0 flex-1 pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
