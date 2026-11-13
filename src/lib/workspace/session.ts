import { MemoryBlobStore } from "./memory-driver";
import { runWithStore, type BlobStore } from "./store";
import {
  assertProjectId,
  getMessages,
  getProject,
  listProjectFiles,
  readProjectFile,
  replaceMessages,
  saveProject,
  writeProjectFile,
  type ProjectMeta,
  type StoredMessage,
} from "./service";

/**
 * Client storage mode: the browser keeps projects, files and messages and sends
 * the current workspace with each request. The server rebuilds it in memory for
 * the duration of that request, so every tool, check and export keeps working on
 * hosts where the filesystem is ephemeral.
 */
export interface WorkspaceFileInput {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}

export interface WorkspaceInput {
  project: { id: string; name?: string; description?: string; stack?: string; model?: string };
  files: WorkspaceFileInput[];
  messages?: StoredMessage[];
}

export interface Session {
  store: BlobStore;
  id: string;
}

const MAX_SEED_FILES = 300;
const MAX_SEED_BYTES = 12 * 1024 * 1024;

export async function prepareSession(input: WorkspaceInput): Promise<Session> {
  const id = assertProjectId(input.project.id);
  if (input.files.length > MAX_SEED_FILES) {
    throw new Error(`Workspace melebihi ${MAX_SEED_FILES} file.`);
  }
  const total = input.files.reduce((sum, file) => sum + file.content.length, 0);
  if (total > MAX_SEED_BYTES) {
    throw new Error("Workspace melebihi batas ukuran yang bisa diproses.");
  }

  const store = new MemoryBlobStore();
  await runWithStore(store, async () => {
    const now = new Date().toISOString();
    const meta: ProjectMeta = {
      id,
      name: input.project.name?.slice(0, 120) || "Project",
      description: input.project.description?.slice(0, 400) || "",
      stack: input.project.stack || "static",
      model: input.project.model || "bw-swift",
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(meta);
    if (input.messages?.length) await replaceMessages(id, input.messages.slice(-80));
    for (const file of input.files) {
      const payload =
        file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content;
      await writeProjectFile(id, file.path, payload);
    }
  });

  return { store, id };
}

export interface SnapshotFile {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
  size: number;
}

export interface WorkspaceSnapshot {
  project: ProjectMeta | null;
  files: SnapshotFile[];
  messages: StoredMessage[];
}

export async function snapshotSession(store: BlobStore, id: string): Promise<WorkspaceSnapshot> {
  return runWithStore(store, async () => {
    const files: SnapshotFile[] = [];
    for (const entry of await listProjectFiles(id)) {
      const file = await readProjectFile(id, entry.path);
      if (file) {
        files.push({ path: file.path, content: file.content, encoding: file.encoding, size: file.size });
      }
    }
    return { project: await getProject(id), files, messages: await getMessages(id) };
  });
}
