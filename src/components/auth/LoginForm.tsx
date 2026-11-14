"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Eye, EyeOff, MessageCircle, TriangleAlert } from "lucide-react";

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
  const invalid = Boolean(error);

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
    <form onSubmit={submit} noValidate className="w-full">
      <div className={invalid ? "gate-shake space-y-6" : "space-y-6"}>
        <div className="gate-field pb-2" data-invalid={invalid}>
          <label
            htmlFor="username"
            className="gate-label mb-2 block font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#a1a1aa]"
          >
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
            aria-invalid={invalid}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full bg-transparent text-[15.5px] text-[#fafafa] outline-none placeholder:text-[#8b8b96]/70 focus-visible:outline-none"
            placeholder="Aomixplorer"
          />
        </div>

        <div className="gate-field pb-2" data-invalid={invalid}>
          <div className="mb-2 flex items-baseline justify-between">
            <label
              htmlFor="password"
              className="gate-label block font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#a1a1aa]"
            >
              Password
            </label>
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Sembunyikan password" : "Tampilkan password"}
              aria-pressed={reveal}
              className="-my-[13px] flex min-h-[40px] items-center gap-1.5 rounded-sm py-[13px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8b96] transition-colors hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
            >
              {reveal ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
              {reveal ? "sembunyikan" : "lihat"}
            </button>
          </div>
          <input
            id="password"
            name="password"
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            aria-invalid={invalid}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full bg-transparent text-[15.5px] text-[#fafafa] outline-none placeholder:text-[#8b8b96]/70 focus-visible:outline-none"
            placeholder="••••••••••"
          />
        </div>
      </div>

      {error ? (
        <p
          id="login-error"
          role="alert"
          key={error}
          className="gate-enter mt-5 flex items-start gap-2 border-l border-[#b02a2a] pl-3 text-[12.5px] leading-relaxed text-[#e58f8f]"
        >
          <TriangleAlert className="mt-[3px] size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !username.trim() || !password}
        className="gate-submit mt-8 flex h-12 w-full items-center justify-between gap-3 bg-[#fafafa] px-5 text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] transition-colors hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-not-allowed disabled:bg-[#27272a] disabled:text-[#71717a]"
      >
        <span>{pending ? "Memeriksa" : "Masuk"}</span>
        <ArrowUpRight className="gate-arrow size-4" aria-hidden />
        {pending ? <span className="gate-pending" aria-hidden /> : null}
      </button>

      <div className="mt-9 border-t border-[#27272a] pt-5">
        <p className="text-[12px] leading-relaxed text-[#8b8b96]">
          Akses hanya untuk owner. Belum punya akun atau lupa password, minta lewat WhatsApp.
        </p>
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Halo owner Aomi, saya ingin meminta akses Aomi Studio.")}`}
          target="_blank"
          rel="noreferrer noopener"
          className="group mt-3 inline-flex items-center gap-2.5 text-[13px] font-medium text-[#fafafa] transition-colors hover:text-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
        >
          <MessageCircle className="size-3.5 text-[#8b8b96] transition-colors group-hover:text-[#fafafa]" aria-hidden />
          Hubungi owner
          <span className="font-mono text-[11.5px] text-[#8b8b96] underline decoration-[#3a3a3f] underline-offset-4 transition-colors group-hover:decoration-[#fafafa]">
            +{whatsapp}
          </span>
        </a>
      </div>

      {!configured ? (
        <p className="mt-6 border border-[#27272a] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#a1a1aa]">
          Server belum punya sumber kredensial. Owner perlu mengisi repo privat atau variabel{" "}
          <code className="font-mono text-[11px] text-[#fafafa]">AOMI_AUTH_JSON</code> di Vercel.
        </p>
      ) : null}
    </form>
  );
}
