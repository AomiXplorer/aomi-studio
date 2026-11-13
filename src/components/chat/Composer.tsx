"use client";

import { useRef, useState } from "react";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
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
}) {
  const [value, setValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="border-t border-line bg-bg px-3 pb-3 pt-2.5 sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        {attachments.length ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((file) => (
              <li key={file.path} className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] text-muted">
                <span className="max-w-[160px] truncate font-mono text-[11px]">{file.name}</span>
                <span className="text-faint">{formatBytes(file.size)}</span>
                <button type="button" onClick={() => onRemoveAttachment(file.path)} aria-label={`Hapus ${file.name}`} className="text-faint hover:text-danger">
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={cn("rounded-lg border border-line bg-panel transition-colors focus-within:border-line-strong", disabled && "opacity-60")}>
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={placeholder || "Jelaskan apa yang ingin dibuat atau diubah..."}
            aria-label="Pesan untuk Aomi"
            disabled={disabled}
            className="min-h-[44px] max-h-56 resize-none border-0 bg-transparent px-3 py-2.5 focus-visible:outline-none"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
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
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled || uploading} aria-label="Lampirkan file">
              {uploading ? <Spinner className="size-3.5" /> : <Paperclip className="size-3.5" />}
            </Button>
            <span className="ml-1 hidden text-[11px] text-faint sm:inline">Enter kirim · Shift+Enter baris baru</span>
            <div className="ml-auto">
              {streaming ? (
                <Button variant="secondary" size="sm" onClick={onStop}>
                  <Square className="size-3" /> Stop
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={submit} disabled={disabled || !value.trim()}>
                  Kirim <ArrowUp className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
