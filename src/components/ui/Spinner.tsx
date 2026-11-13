import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      className={cn("inline-block size-3.5 animate-spin rounded-full border border-current border-t-transparent", className)}
    />
  );
}
