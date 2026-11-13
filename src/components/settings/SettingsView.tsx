"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { Badge, Dot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { api, type ProviderStatus } from "@/lib/client/api";
import type { ProviderModel } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModel(window.localStorage.getItem("aomi:model") || "");
    const storedTemp = window.localStorage.getItem("aomi:temperature");
    if (storedTemp) setTemperature(Number(storedTemp));
    void refresh(false);
  }, []);

  const refresh = async (force: boolean) => {
    setRefreshing(true);
    setError(null);
    try {
      const [statusRes, modelsRes] = await Promise.all([api.status.get(force), api.models.list(force).catch(() => ({ models: [] as ProviderModel[] }))]);
      setStatus(statusRes);
      setModels(modelsRes.models.filter((item) => item.kind === "text"));
      if (!window.localStorage.getItem("aomi:model")) setModel(statusRes.defaultModel);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const saveModel = (value: string) => {
    setModel(value);
    window.localStorage.setItem("aomi:model", value);
  };

  const capability = (available: boolean | undefined, label: string) =>
    available ? (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ok">
        <CheckCircle2 className="size-3.5" /> {label}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-warn">
        <AlertCircle className="size-3.5" /> {label}
      </span>
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Settings</p>
        <h1 className="mt-1.5 text-[22px] font-medium tracking-tight text-ink">Model, provider dan penyimpanan</h1>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Semua kredensial hidup di environment server. Halaman ini hanya membaca status, tidak pernah menampilkan API key.
        </p>
      </header>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Tutup">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <section className="mb-5 rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13.5px] font-medium text-ink">Agent</h2>
          <Button variant="ghost" size="sm" onClick={() => void refresh(true)} disabled={refreshing}>
            {refreshing ? <Spinner className="size-3" /> : <RefreshCw className="size-3.5" />} Test koneksi
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="default-model" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
              Model default
            </label>
            <Select id="default-model" value={model} onChange={(event) => saveModel(event.target.value)} disabled={loading || !models.length}>
              {models.length === 0 ? <option value="">Belum tersedia</option> : null}
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.tier ? ` · ${item.tier}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="temperature" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
              Temperature · {temperature.toFixed(1)}
            </label>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(event) => {
                const value = Number(event.target.value);
                setTemperature(value);
                window.localStorage.setItem("aomi:temperature", String(value));
              }}
              className="h-9 w-full accent-[var(--color-accent)]"
            />
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          Temperature dipakai per permintaan chat. Model default bisa diganti kapan saja dari header Chat.
        </p>
      </section>

      <section className="mb-5 rounded-lg border border-line bg-panel p-4">
        <h2 className="mb-3 text-[13.5px] font-medium text-ink">Provider</h2>
        {loading ? (
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <Spinner /> Memeriksa provider...
          </p>
        ) : status ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <Dot tone={status.configured ? "ok" : "danger"} />
              <span className="text-ink-dim">{status.configured ? "API key terpasang di server" : "API key belum diatur"}</span>
              <code className="ml-auto truncate font-mono text-[11px] text-faint">{status.baseUrl}</code>
            </div>

            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
              <li className="flex flex-wrap items-center gap-2 bg-surface/40 px-3 py-2">
                <span className="w-[86px] shrink-0 text-[12px] text-ink-dim">Chat</span>
                {capability(status.chat.available, status.chat.available ? `${status.chat.models ?? 0} model teks` : "tidak tersedia")}
                {status.chat.error ? <span className="ml-auto text-[11.5px] text-faint">{status.chat.error}</span> : null}
              </li>
              <li className="flex flex-wrap items-center gap-2 bg-surface/40 px-3 py-2">
                <span className="w-[86px] shrink-0 text-[12px] text-ink-dim">Image</span>
                {capability(status.image.available, status.image.available ? `${status.image.models?.join(", ")}` : "tidak tersedia")}
                {status.image.error ? <span className="ml-auto text-[11.5px] text-faint">{status.image.error}</span> : null}
              </li>
              <li className="flex flex-wrap items-center gap-2 bg-surface/40 px-3 py-2">
                <span className="w-[86px] shrink-0 text-[12px] text-ink-dim">Audio</span>
                {capability(status.audio.available, status.audio.available ? `${status.audio.models?.map((item) => item.id).join(", ")}` : "tidak tersedia")}
                {status.audio.error ? <span className="ml-auto text-[11.5px] text-faint">{status.audio.error}</span> : null}
              </li>
            </ul>
            <p className="text-[11.5px] leading-relaxed text-faint">
              Chat memakai tool calling. {status.audio.note || "Audio butuh paket suara aktif di provider."} Image ditagih per gambar oleh provider.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="mb-2 text-[13.5px] font-medium text-ink">Penyimpanan workspace</h2>
        {status ? (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={status.storage.persistent ? "ok" : "warn"}>{status.storage.driver}</Badge>
              <span className={cn("text-[12px]", status.storage.persistent ? "text-ok" : "text-warn")}>
                {status.storage.persistent ? "persisten" : "sementara"}
              </span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{status.storage.note}</p>
          </>
        ) : (
          <p className="text-[12px] text-muted">Status belum tersedia.</p>
        )}
      </section>

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        Tema gelap adalah default dan dirancang untuk dipakai berlama-lama. Tampilan tetap terbaca di layar ponsel dengan sidebar yang bisa dibuka-tutup.
      </p>
    </div>
  );
}
