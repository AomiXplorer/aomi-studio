"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { ProviderModel } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/**
 * Model chooser that behaves like a native picker: a compact chip in the composer
 * that opens a searchable panel above it on desktop and a sheet from the bottom on
 * a phone, instead of an inline <select> list.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ProviderModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const current = models.find((item) => item.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((item) =>
      `${item.label} ${item.id} ${item.family}`.toLowerCase().includes(needle),
    );
  }, [models, query]);

  // The composer blurs its own background, and a backdrop-filter ancestor becomes the
  // containing block for fixed children: the phone sheet drew inside the composer box and
  // overlapped the page. Below 640px the sheet is portalled to <body> instead.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setSheet(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open || !sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, sheet]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(
      Math.max(
        0,
        models.findIndex((item) => item.id === value),
      ),
    );
    const isDesktop = window.matchMedia("(min-width: 640px)").matches;
    if (isDesktop) searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, models, value]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listId}-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        disabled={disabled || models.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${current?.label ?? "belum tersedia"}. Ganti model`}
        className={cn(
          "flex h-8 max-w-[190px] items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[12px] text-muted transition-colors",
          "hover:border-line hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          open && "border-line bg-surface text-ink",
          (disabled || models.length === 0) && "opacity-60",
        )}
      >
        <span className="truncate">
          {current?.label ?? "Model belum tersedia"}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && sheet && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex flex-col justify-end sm:hidden">
              <button
                type="button"
                aria-label="Tutup pilihan model"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-[rgb(9_9_11/0.62)] backdrop-blur-[2px]"
              />
              <div
                role="dialog"
                aria-label="Pilih model"
                className="relative flex max-h-[74svh] flex-col overflow-hidden rounded-t-[18px] border border-line bg-panel pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]"
              >
                <PanelBody />
              </div>
            </div>,
            document.body,
          )
        : null}

      {open && !sheet ? (
        <div
          className={cn(
            "absolute bottom-full right-0 z-50 mb-2 flex max-h-80 w-[320px] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_24px_60px_-30px_rgb(9_9_11/0.45)]",
          )}
          role="dialog"
          aria-label="Pilih model"
        >
          <PanelBody />
        </div>
      ) : null}
    </div>
  );

  function PanelBody() {
    return (
      <>
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint">
            Model
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup pilihan model"
            className="grid size-6 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink sm:hidden"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const picked = filtered[active];
                if (picked) choose(picked.id);
              }
            }}
            placeholder="Cari model"
            aria-label="Cari model"
            aria-controls={listId}
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
          />
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Model tersedia"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <li className="px-2.5 py-3 text-[12.5px] text-faint">
              Tidak ada model yang cocok.
            </li>
          ) : null}
          {filtered.map((item, index) => {
            const selected = item.id === value;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    index === active ? "bg-surface" : "bg-transparent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                      <span className="truncate font-mono">{item.family}</span>
                      {item.tier ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{item.tier}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  {selected ? (
                    <Check className="size-3.5 shrink-0 text-ink" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }
}
