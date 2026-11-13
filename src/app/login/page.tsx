import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { loadAuthConfig, ownerWhatsApp } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Masuk — Aomi",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const state = await loadAuthConfig();
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between border-r border-line bg-[#09090b] p-10 text-[#fafafa] lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[10px] bg-[#fafafa] text-[14px] font-semibold text-[#09090b]">a</span>
          <span className="text-[15px] font-semibold tracking-tight">aomi</span>
        </div>

        <div className="max-w-[420px]">
          <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Satu tempat untuk membangun, menjalankan, dan mengekspor project.
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-[#a1a1aa]">
            Agent menulis file sungguhan di workspace, kamu meninjau diff-nya, lalu mengunduh ZIP yang sama persis
            dengan isi project. Image dan audio studio ada di alur yang sama.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-[#27272a] pt-5 text-[12px] text-[#a1a1aa]">
            <div>
              <dt className="text-[#71717a]">Agent</dt>
              <dd className="mt-1 text-[#fafafa]">19 tool</dd>
            </div>
            <div>
              <dt className="text-[#71717a]">Workspace</dt>
              <dd className="mt-1 text-[#fafafa]">per project</dd>
            </div>
            <div>
              <dt className="text-[#71717a]">Ekspor</dt>
              <dd className="mt-1 text-[#fafafa]">ZIP asli</dd>
            </div>
          </dl>
        </div>

        <p className="flex items-center gap-2 text-[11.5px] text-[#71717a]">
          <Lock className="size-3" aria-hidden /> Sesi ditandatangani di server dan berakhir otomatis setelah 8 jam.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-[14px] font-semibold text-accent-ink">a</span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">aomi</span>
          </div>

          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Masuk ke Aomi</h2>
          <p className="mt-1.5 text-[13px] text-muted">Akses terbatas. Gunakan akun owner yang diberikan.</p>

          <div className="mt-7">
            <LoginForm next={next} whatsapp={ownerWhatsApp(state)} configured={Boolean(state.config)} />
          </div>
        </div>
      </section>
    </div>
  );
}
