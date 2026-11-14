"use client";

import { useRef, useState } from "react";
import { ArrowUp, Plus, Square, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn, formatBytes } from "@/lib/utils";

export interface PendingAttachment {
  name: string;
  path: string;
  size: number;
}

/**
 * The composer stays one calm row of controls: attach, model, send. It sits on the same
 * 720px grid as the conversation so the text never jumps horizontally when you type.
 */
export function Composer({
  onSend,
  onStop,
  streaming,
  disabled,
  attachments,
  onAttach,
  onRemoveAttachment,
  placeholder,
  uploading,
  modelSlot,
}: {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  attachments: PendingAttachment[];
  onAttach: (file: File) => void;
  onRemoveAttachment: (path: string) => void;
  placeholder?: string;
  uploading?: boolean;
  modelSlot?: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(value.trim()) && !streaming && !disabled;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const round = "relative grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-150 before:absolute before:-inset-1.5 before:content-['']";

  return (
    <div className="shrink-0 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-[720px]">
        <div
          className={cn(
            "aomi-composer-shell rounded-[20px] border border-line bg-raised/75 shadow-[var(--composer-shadow)] backdrop-blur-xl",
            disabled && "opacity-70",
          )}
        >
          {attachments.length ? (
            <ul className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
              {attachments.map((file) => (
                <li
                  key={file.path}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-muted"
                >
                  <span className="max-w-[160px] truncate font-mono text-[11px] text-ink-dim">{file.name}</span>
                  <span className="text-faint">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(file.path)}
                    aria-label={`Hapus ${file.name}`}
                    className="text-faint transition-colors hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <label htmlFor="aomi-composer" className="sr-only">
            Pesan untuk Aomi
          </label>
          <textarea
            id="aomi-composer"
            aria-label="Pesan untuk Aomi"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={placeholder || "Mau bikin apa bareng Aomi?"}
            disabled={disabled}
            className="max-h-[38vh] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[14px] leading-[1.55] text-ink placeholder:text-faint focus:outline-none"
          />

          <div className="flex items-center gap-2 px-2 pb-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onAttach(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
              aria-label="Lampirkan file"
              title="Lampirkan file"
              className={cn(round, "border border-line text-muted hover:border-line-strong hover:text-ink disabled:opacity-50")}
            >
              {uploading ? <Spinner className="size-3.5" /> : <Plus className="size-4" aria-hidden />}
            </button>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <div className="min-w-0 overflow-hidden">{modelSlot}</div>
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Hentikan"
                  title="Hentikan"
                  className={cn(round, "bg-surface text-ink hover:bg-line")}
                >
                  <Square className="size-3" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSend}
                  aria-label="Kirim pesan"
                  title="Kirim"
                  className={cn(
                    round,
                    canSend ? "bg-accent text-accent-ink hover:bg-accent/90" : "bg-surface text-faint",
                  )}
                >
                  {disabled ? <Spinner className="size-3.5" /> : <ArrowUp className="size-4" aria-hidden />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
