"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderCode, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import type { ProjectMeta } from "@/lib/workspace/service";
import { formatRelative } from "@/lib/utils";

export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [templates, setTemplates] = useState<{ id: string; label: string; description: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.projects.list();
        setProjects(result.projects);
        setTemplates(result.templates);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onDeleted = (event: Event) => {
      const id = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (id) setProjects((current) => current.filter((project) => project.id !== id));
    };
    const onCreated = () => {
      void api.projects.list().then(({ projects: list }) => setProjects(list));
    };
    window.addEventListener("aomi:project-deleted", onDeleted);
    window.addEventListener("aomi:project-created", onCreated);
    return () => {
      window.removeEventListener("aomi:project-deleted", onDeleted);
      window.removeEventListener("aomi:project-created", onCreated);
    };
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { project } = await api.projects.create({ name: name.trim(), template });
      setProjects((current) => [project, ...current]);
      setName("");
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string, projectName: string) => {
    if (!window.confirm(`Hapus project "${projectName}" beserta seluruh filenya?`)) return;
    try {
      await api.projects.remove(id);
      setProjects((current) => current.filter((project) => project.id !== id));
    } catch (removeError) {
      setError((removeError as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Projects</p>
        <h1 className="mt-1.5 text-[22px] font-medium tracking-tight text-ink">Workspace yang pernah dikerjakan</h1>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Setiap project punya workspace sendiri. Buka untuk melihat file, lanjutkan lewat chat, atau unduh sebagai ZIP.
        </p>
      </header>

      <div className="mb-6 rounded-lg border border-line bg-panel p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama project baru"
            aria-label="Nama project baru"
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
          />
          <Select value={template} onChange={(event) => setTemplate(event.target.value)} aria-label="Template" className="sm:w-[200px]">
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={() => void create()} disabled={!name.trim() || creating}>
            {creating ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} Buat
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Tutup">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner /> Memuat project...
        </p>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
          <FolderCode className="mx-auto size-5 text-faint" aria-hidden />
          <p className="mt-2 text-[13px] text-muted">Belum ada project. Buat satu di atas, atau minta langsung lewat Chat.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {projects.map((project) => (
            <li key={project.id} className="flex flex-wrap items-center gap-3 bg-panel/60 px-3.5 py-3 transition-colors hover:bg-surface/60">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/projects/${project.id}`} className="truncate text-[13.5px] font-medium text-ink hover:text-accent">
                    {project.name}
                  </Link>
                  <Badge tone="neutral">{project.stack}</Badge>
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-faint">
                  diperbarui {formatRelative(project.updatedAt)} · model {project.model}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href={`/projects/${project.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted hover:bg-surface hover:text-ink"
                >
                  <FolderCode className="size-3.5" /> Workspace
                </Link>
                <Link href="/chat" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted hover:bg-surface hover:text-ink">
                  <MessageSquare className="size-3.5" /> Chat
                </Link>
                <Button variant="ghost" size="sm" onClick={() => void remove(project.id, project.name)} aria-label={`Hapus ${project.name}`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
