"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, FolderInput, Mic, Trash2, Volume2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import type { Asset, ProjectMeta } from "@/lib/workspace/service";

interface VoiceModel {
  id: string;
  tokensPerCharacter: number | null;
  voices: { id: string; name: string; gender: string | null; accent: string | null; description: string | null }[];
}

export function AudioStudio() {
  const [text, setText] = useState("");
  const [models, setModels] = useState<VoiceModel[]>([]);
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [format, setFormat] = useState("mp3");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [latest, setLatest] = useState<{ dataUrl: string; mime: string; voice: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [projectsRes, voicesRes] = await Promise.all([api.projects.list(), api.voices.list().catch(() => null)]);
        setProjects(projectsRes.projects);
        setProjectId(projectsRes.projects[0]?.id || "");
        if (voicesRes?.configured) {
          setModels(voicesRes.models);
          const first = voicesRes.models[0];
          setModel(first?.id || "");
          setVoice(first?.voices[0]?.id || voicesRes.defaultVoice || "");
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
      .then((result) => setAssets(result.assets.filter((asset) => asset.kind === "audio")))
      .catch(() => undefined);
  }, [projectId]);

  const activeModel = models.find((item) => item.id === model);

  const generate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.audio.generate({
        text: text.trim(),
        model: model || undefined,
        voice: voice || undefined,
        format,
        projectId: projectId || undefined,
      });
      setLatest({ dataUrl: result.dataUrl, mime: result.mime, voice: result.voice });
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
      await api.files.saveBinary(projectId, `public/audio/${asset.name}`, asset.dataUrl);
      setNotice(`${asset.name} disimpan ke public/audio/ di workspace.`);
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
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Audio Studio</p>
        <h1 className="mt-1.5 text-[22px] font-medium tracking-tight text-ink">Text to speech lewat provider yang benar-benar mengeluarkan audio</h1>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Kalau paket suara belum aktif di provider, Aomi menampilkan pesan aslinya. Tidak ada tombol yang hanya memutar animasi.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-line bg-panel p-3.5">
          <label htmlFor="audio-text" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
            Teks
          </label>
          <Textarea
            id="audio-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder="Halo, aku Aomi. Aku bisa menulis kode dan membangun project untukmu."
            className="min-h-[140px]"
          />

          <div className="mt-3 grid gap-2">
            <div>
              <label htmlFor="audio-model" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                Model suara
              </label>
              <Select
                id="audio-model"
                value={model}
                onChange={(event) => {
                  const next = event.target.value;
                  setModel(next);
                  const nextModel = models.find((item) => item.id === next);
                  setVoice(nextModel?.voices[0]?.id || "");
                }}
              >
                {models.length === 0 ? <option value="">Tidak ada model suara</option> : null}
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                    {item.tokensPerCharacter ? ` · ${item.tokensPerCharacter}/karakter` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="audio-voice" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                Suara
              </label>
              <Select id="audio-voice" value={voice} onChange={(event) => setVoice(event.target.value)} disabled={!activeModel?.voices.length}>
                {activeModel?.voices.length ? (
                  activeModel.voices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.accent || "netral"}
                    </option>
                  ))
                ) : (
                  <option value="">Provider memakai default akun</option>
                )}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="audio-format" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                  Format
                </label>
                <Select id="audio-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                  {["mp3", "wav", "opus", "aac", "flac"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="audio-project" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                  Project
                </label>
                <Select id="audio-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  {projects.length === 0 ? <option value="">Belum ada project</option> : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <Button variant="primary" className="mt-3 w-full" onClick={() => void generate()} disabled={busy || !text.trim()}>
            {busy ? <Spinner className="size-3.5" /> : <Mic className="size-3.5" />} Generate suara
          </Button>

          {notice ? <p className="mt-3 rounded-md border border-ok/30 bg-ok/10 px-2 py-1.5 text-[11.5px] text-ok">{notice}</p> : null}
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
            <div className="mb-4 rounded-lg border border-line bg-panel p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="ok">baru</Badge>
                <span className="font-mono text-[11px] text-faint">{latest.voice}</span>
                <a href={latest.dataUrl} download="aomi-voice" className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline">
                  <Download className="size-3" /> Unduh
                </a>
              </div>
              <audio controls src={latest.dataUrl} className="w-full" />
            </div>
          ) : null}

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Audio tersimpan</p>
            <span className="text-[11px] text-faint">{assets.length} file</span>
          </div>

          {assets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
              <Volume2 className="mx-auto size-5 text-faint" aria-hidden />
              <p className="mt-2 text-[12.5px] text-muted">Belum ada audio di project ini.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {assets.map((asset) => (
                <li key={asset.id} className="bg-panel/60 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-dim">{asset.prompt || asset.name}</span>
                    <button type="button" onClick={() => void saveToWorkspace(asset)} aria-label="Simpan ke workspace" className="text-faint hover:text-accent">
                      <FolderInput className="size-3.5" />
                    </button>
                    <a href={asset.dataUrl} download={asset.name} aria-label="Unduh" className="text-faint hover:text-accent">
                      <Download className="size-3.5" />
                    </a>
                    <button type="button" onClick={() => void remove(asset)} aria-label="Hapus" className="text-faint hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <audio controls src={asset.dataUrl} className="h-8 w-full" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
