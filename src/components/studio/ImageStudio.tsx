"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, FolderInput, Image as ImageIcon, Trash2, Wand2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import type { Asset, ProjectMeta } from "@/lib/workspace/service";
import type { ProviderModel } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:2", "2:3"] as const;

export function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>("1:1");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectId, setProjectId] = useState("");
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [model, setModel] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [latest, setLatest] = useState<{ dataUrl: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [projectsRes, modelsRes, statusRes] = await Promise.all([api.projects.list(), api.models.list(), api.status.get()]);
        setProjects(projectsRes.projects);
        const initialProject = projectsRes.projects[0]?.id || "";
        setProjectId(initialProject);
        const imageModels = modelsRes.models.filter((item) => item.kind === "image");
        setModels(imageModels);
        setModel(imageModels[0]?.id || "");
        if (!statusRes.image.available) {
          setNotice(statusRes.image.error || statusRes.image.note || "Model gambar belum tersedia di provider.");
        }
      } catch (loadError) {
        setError((loadError as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.assets
      .list(projectId)
      .then((result) => setAssets(result.assets.filter((asset) => asset.kind === "image")))
      .catch(() => undefined);
  }, [projectId]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.image.generate({ prompt: prompt.trim(), aspectRatio: ratio, model: model || undefined, projectId: projectId || undefined });
      setLatest({ dataUrl: result.dataUrl, model: result.model });
      if (result.asset) setAssets((current) => [result.asset as Asset, ...current.filter((asset) => asset.id !== result.asset?.id)]);
    } catch (generateError) {
      setError((generateError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveToWorkspace = async (asset: Asset) => {
    if (!projectId) return;
    try {
      await api.files.saveBinary(projectId, `public/${asset.name}`, asset.dataUrl);
      setNotice(`${asset.name} disimpan ke public/${asset.name} di workspace.`);
    } catch (saveError) {
      setError((saveError as Error).message);
    }
  };

  const remove = async (asset: Asset) => {
    if (!projectId) return;
    try {
      await api.assets.remove(projectId, asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (removeError) {
      setError((removeError as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Image Studio</p>
        <h1 className="mt-1.5 text-[22px] font-medium tracking-tight text-ink">Gambar dari model provider, bukan placeholder</h1>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Hasil asli dari endpoint images provider. Setiap gambar ditagih per unit oleh provider, jadi risikonya kuota diteruskan apa adanya ke sini.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-line bg-panel p-3.5">
          <label htmlFor="image-prompt" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
            Prompt
          </label>
          <Textarea
            id="image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            placeholder="ilustrasi anime seorang programmer perempuan, layar gelap, cahaya hangat dari monitor"
            className="min-h-[120px]"
          />

          <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Rasio</p>
          <div className="flex flex-wrap gap-1.5">
            {RATIOS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRatio(value)}
                aria-pressed={ratio === value}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[11.5px] transition-colors",
                  ratio === value ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2">
            <div>
              <label htmlFor="image-model" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                Model
              </label>
              <Select id="image-model" value={model} onChange={(event) => setModel(event.target.value)}>
                {models.length === 0 ? <option value="">Tidak ada model gambar</option> : null}
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="image-project" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                Simpan ke project
              </label>
              <Select id="image-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.length === 0 ? <option value="">Belum ada project</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Button variant="primary" className="mt-3 w-full" onClick={() => void generate()} disabled={busy || !prompt.trim() || !model}>
            {busy ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />} Generate
          </Button>

          {notice ? <p className="mt-3 rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5 text-[11.5px] text-warn">{notice}</p> : null}
          {error ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11.5px] text-danger">
              <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Tutup">
                <X className="size-3" />
              </button>
            </p>
          ) : null}
        </section>

        <section>
          {latest ? (
            <figure className="mb-4 overflow-hidden rounded-lg border border-line bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.dataUrl} alt={prompt || "Hasil generate"} className="max-h-[420px] w-full object-contain bg-bg" />
              <figcaption className="flex items-center gap-2 border-t border-line px-3 py-2 text-[11.5px] text-faint">
                <Badge tone="ok">baru</Badge>
                <span className="font-mono">{latest.model}</span>
                <a href={latest.dataUrl} download="aomi-image.png" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
                  <Download className="size-3" /> Unduh
                </a>
              </figcaption>
            </figure>
          ) : null}

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Galeri project</p>
            <span className="text-[11px] text-faint">{assets.length} gambar</span>
          </div>

          {assets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
              <ImageIcon className="mx-auto size-5 text-faint" aria-hidden />
              <p className="mt-2 text-[12.5px] text-muted">Belum ada gambar tersimpan di project ini.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {assets.map((asset) => (
                <li key={asset.id} className="group overflow-hidden rounded-lg border border-line bg-panel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.dataUrl} alt={asset.prompt || asset.name} className="aspect-square w-full object-cover" />
                  <div className="flex items-center gap-1 border-t border-line px-1.5 py-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-faint">{asset.name}</span>
                    <button type="button" onClick={() => void saveToWorkspace(asset)} aria-label="Simpan ke workspace" title="Simpan ke workspace" className="text-faint hover:text-accent">
                      <FolderInput className="size-3.5" />
                    </button>
                    <a href={asset.dataUrl} download={asset.name} aria-label="Unduh" className="text-faint hover:text-accent">
                      <Download className="size-3.5" />
                    </a>
                    <button type="button" onClick={() => void remove(asset)} aria-label="Hapus" className="text-faint hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
