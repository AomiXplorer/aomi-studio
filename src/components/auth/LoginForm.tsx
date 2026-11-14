"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, MessageCircle } from "lucide-react";

/** Only ever redirects inside this site: `//evil.com` and absolute URLs are refused. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

/**
 * The sign-in is presented as one session in a shell: a numbered gutter, a spine,
 * fields that behave like prompt lines and an output log under them. Everything a
 * form still needs (labels, autocomplete, aria-invalid, focus rings) is kept in place.
 */
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

  const row = "grid grid-cols-[1.5rem_1px_minmax(0,1fr)] items-stretch";

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <div className={invalid ? "sh-shake" : undefined}>
        <div className={`${row} sh-field`} data-invalid={invalid}>
          <span className="sh-gutter pr-2 pt-4 font-mono text-[10px] leading-none text-[#8b8b96]">01</span>
          <span className="bg-[#1c1c20]" aria-hidden />
          <div className="sh-ruler px-4 pb-3.5 pt-3.5">
            <label
              htmlFor="username"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]"
            >
              Username
            </label>
            <div className="flex items-baseline gap-2">
              <span className="select-none font-mono text-[13px] leading-none text-[#3a3a3f]" aria-hidden>
                ›
              </span>
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
                className="w-full bg-transparent font-mono text-[14px] leading-none tracking-[-0.01em] text-[#fafafa] outline-none placeholder:text-[#52525b] focus-visible:outline-none"
              />
            </div>
          </div>
        </div>

        <div className={`${row} sh-field`} data-invalid={invalid}>
          <span className="sh-gutter pr-2 pt-4 font-mono text-[10px] leading-none text-[#8b8b96]">02</span>
          <span className="bg-[#1c1c20]" aria-hidden />
          <div className="sh-ruler px-4 pb-3.5 pt-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="password"
                className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setReveal((value) => !value)}
                aria-label={reveal ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={reveal}
                className="-my-[13px] flex min-h-[40px] items-center gap-1.5 py-[13px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8b96] transition-colors hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
              >
                {reveal ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
                {reveal ? "tutup" : "lihat"}
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="select-none font-mono text-[13px] leading-none text-[#3a3a3f]" aria-hidden>
                ›
              </span>
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
                className="w-full bg-transparent font-mono text-[14px] leading-none tracking-[-0.01em] text-[#fafafa] outline-none placeholder:text-[#52525b] focus-visible:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`${row} mt-4`}>
        <span className="pt-3" aria-hidden />
        <span className="bg-[#1c1c20]" aria-hidden />
        <div className="px-0 pt-0">
          <button
            type="submit"
            disabled={pending || !username.trim() || !password}
            className="sh-submit flex h-12 w-full items-center justify-between gap-3 bg-[#fafafa] px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#09090b] transition-colors hover:bg-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-not-allowed disabled:bg-[#18181b] disabled:text-[#8b8b96]"
          >
            <span className="flex items-center gap-2">
              {pending ? "Memeriksa" : "Masuk"}
              {pending ? <span className="sh-dots" aria-hidden /> : null}
            </span>
            {pending ? (
              <ArrowRight className="size-3.5 animate-pulse" aria-hidden />
            ) : (
              <span className="flex items-center gap-2">
                <span className="sh-keycap">↵</span>
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            )}
          </button>

          {/* Output log: the only place where the result of a try appears. */}
          <div aria-live="polite" className="min-h-[42px] pt-3">
            {error ? (
              <p id="login-error" role="alert" className="sh-enter flex items-start gap-2 font-mono text-[11.5px] leading-relaxed text-[#e58f8f]">
                <span className="select-none" aria-hidden>
                  !
                </span>
                <span>{error}</span>
              </p>
            ) : (
              <p className="font-mono text-[11.5px] leading-relaxed text-[#8b8b96]">
                {pending ? "memeriksa kredensial" : "menunggu input"}
              </p>
            )}
          </div>

          {!configured ? (
            <p className="mt-1 border-l border-[#3a3a3f] pl-3 font-mono text-[11px] leading-relaxed text-[#8b8b96]">
              server belum punya sumber kredensial. isi repo privat atau{" "}
              <code className="text-[#fafafa]">AOMI_AUTH_JSON</code> di Vercel.
            </p>
          ) : null}
        </div>
      </div>

      <div className={`${row} mt-6`}>
        <span className="pt-1" aria-hidden />
        <span className="bg-[#1c1c20]" aria-hidden />
        <div className="px-4">
          <p className="font-mono text-[11px] leading-relaxed text-[#8b8b96]">
            akses hanya untuk owner. lupa password, minta lewat WhatsApp.
          </p>
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Halo owner Aomi, saya ingin meminta akses Aomi Studio.")}`}
            target="_blank"
            rel="noreferrer noopener"
            className="group mt-2 inline-flex items-center gap-2 font-mono text-[11.5px] text-[#fafafa] transition-colors hover:text-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            <MessageCircle className="size-3.5 text-[#8b8b96]" aria-hidden />
            hubungi owner
            <span className="text-[#8b8b96] underline decoration-[#3a3a3f] underline-offset-4 transition-colors group-hover:decoration-[#fafafa]">
              +{whatsapp}
            </span>
          </a>
        </div>
      </div>
    </form>
  );
}
