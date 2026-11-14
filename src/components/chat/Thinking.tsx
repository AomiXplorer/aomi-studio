/**
 * Aomi working. Three dots that glow in sequence, used anywhere a spinner would have
 * gone: it reads as a thought in progress rather than a machine waiting.
 */
export function Thinking({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-muted">
      <span className="aomi-think" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
