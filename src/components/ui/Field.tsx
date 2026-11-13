"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-md border border-line bg-panel px-3 py-2 text-[13px] text-ink placeholder:text-faint transition-colors duration-150 focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(base, "min-h-[80px] resize-y leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(base, "h-9 appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ children, hint, htmlFor }: { children: React.ReactNode; hint?: string; htmlFor?: string }) {
  const generated = useId();
  const id = htmlFor || generated;
  return (
    <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">{children}</span>
      {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <div id={id}>{children}</div>
      {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
