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
  hint,
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
  hint?: string | null;
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

  return (
    <div className="bg-gradient-to-t from-bg via-bg px-3 pb-4 pt-2 sm:px-6">
      <div className="mx-auto w-full max-w-[760px]">
        <div
          className={cn(
            "aomi-composer rounded-[22px] border border-line bg-raised transition-colors focus-within:border-line-strong",
            disabled && "opacity-70",
          )}
        >
          {attachments.length ? (
            <ul className="flex flex-wrap gap-1.5 px-3 pt-3">
              {attachments.map((file) => (
                <li key={file.path} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-muted">
                  <span className="max-w-[160px] truncate font-mono text-[11px] text-ink-dim">{file.name}</span>
                  <span className="text-faint">{formatBytes(file.size)}</span>
                  <button type="button" onClick={() => onRemoveAttachment(file.path)} aria-label={`Hapus ${file.name}`} className="text-faint hover:text-danger">
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
            placeholder={placeholder || "Tanya apa saja, atau minta Aomi membangun sesuatu..."}
            disabled={disabled}
            className="max-h-64 w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[14px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5">
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
              className="grid size-8 place-items-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {uploading ? <Spinner className="size-3.5" /> : <Plus className="size-4" />}
            </button>
            {hint ? <span className="ml-1 hidden truncate text-[11.5px] text-faint md:inline">{hint}</span> : null}

            <div className="ml-auto flex items-center gap-1.5">
              {modelSlot}
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Hentikan"
                  title="Hentikan"
                  className="grid size-8 place-items-center rounded-full bg-surface text-ink transition-colors hover:bg-line"
                >
                  <Square className="size-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSend}
                  aria-label="Kirim pesan"
                  title="Kirim"
                  className={cn(
                    "grid size-8 place-items-center rounded-full transition-colors duration-150",
                    canSend ? "bg-accent text-accent-ink hover:bg-accent/90" : "bg-surface text-faint",
                  )}
                >
                  {disabled ? <Spinner className="size-3.5" /> : <ArrowUp className="size-4" />}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-faint">
          Enter mengirim · Shift+Enter baris baru. Aomi menulis file sungguhan di workspace project.
        </p>
      </div>
    </div>
  );
}
