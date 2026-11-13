"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, MessageCircle, TriangleAlert } from "lucide-react";

/** Only ever redirects inside this site: `//evil.com` and absolute URLs are refused. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

export function LoginForm({ next, whatsapp, configured }: { next?: string; whatsapp: string; configured: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const destination = safeNext(next);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setError(
          response.status === 429
            ? payload?.error?.message || "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."
            : payload?.error?.message || "Username atau password salah.",
        );
        setPassword("");
        return;
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[380px]">
      <div className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-[12.5px] font-medium text-ink-dim">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
            className="h-11 w-full rounded-lg border border-line bg-raised px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
            placeholder="Username owner"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-medium text-ink-dim">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={reveal ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
              className="h-11 w-full rounded-lg border border-line bg-raised pl-3 pr-11 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Sembunyikan password" : "Tampilkan password"}
              aria-pressed={reveal}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-faint transition-colors hover:text-ink"
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p id="login-error" role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !username.trim() || !password}
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[13.5px] font-medium text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Memeriksa" : "Masuk"}
        {pending ? null : <ArrowRight className="size-3.5" aria-hidden />}
      </button>

      <div className="mt-6 border-t border-line pt-4">
        <p className="text-[12px] leading-relaxed text-muted">
          Akses hanya untuk owner. Belum punya akun atau lupa password? Hubungi owner lewat WhatsApp.
        </p>
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Halo owner Aomi, saya ingin meminta akses Aomi Studio.")}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink transition-colors hover:border-line-strong"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          WhatsApp owner
          <span className="font-mono text-[11.5px] text-faint">+{whatsapp}</span>
        </a>
      </div>

      {!configured ? (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-[11.5px] leading-relaxed text-muted">
          Server belum punya sumber kredensial. Owner perlu mengisi repo privat atau variabel{" "}
          <code className="font-mono text-[11px] text-ink-dim">AOMI_AUTH_JSON</code> di Vercel.
        </p>
      ) : null}
    </form>
  );
}
