"use client";

import { Wrench } from "lucide-react";

/**
 * What a visitor sees when the provider balance is gone. One line, no stack trace and no
 * retry button that would fail again; the owner has already been told on Telegram.
 */
export function Maintenance({ note }: { note?: string }) {
  return (
    <div className="aomi-rise flex flex-col items-center justify-center rounded-2xl border border-line bg-raised/60 px-5 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-xl border border-line bg-bg text-muted">
        <Wrench className="size-4" aria-hidden />
      </span>
      <h2 className="mt-4 text-[clamp(1.1rem,3.6vw,1.4rem)] font-semibold tracking-[-0.02em] text-ink">Web Under maintenance</h2>
      <p className="mt-2 max-w-[38ch] text-[13px] leading-relaxed text-muted">
        Layanan AI sedang tidak tersedia. Owner sudah menerima pemberitahuan dan akan mengaktifkannya kembali.
      </p>
      {note ? <p className="mt-3 max-w-[44ch] text-[11.5px] leading-relaxed text-faint">{note}</p> : null}
    </div>
  );
}
