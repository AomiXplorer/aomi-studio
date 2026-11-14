import JSZip from "jszip";
import { listAssets, listProjectFiles, readProjectFile, readProjectText, getProject } from "@/lib/workspace/service";
import { RESERVED_ROOT_SEGMENTS } from "@/lib/workspace/paths";

export interface ZipResult {
  buffer: Buffer;
  filename: string;
  files: number;
  bytes: number;
}

/** Builds a real ZIP from the stored workspace, including generated assets. */
export async function buildProjectZip(projectId: string): Promise<ZipResult> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project tidak ditemukan.");

  const zip = new JSZip();
  const entries = await listProjectFiles(projectId);
  let fileCount = 0;

  for (const entry of entries) {
    if (RESERVED_ROOT_SEGMENTS.has(entry.path.split("/")[0])) continue;
    const file = await readProjectFile(projectId, entry.path);
    if (!file) continue;
    if (file.encoding === "utf8") {
      zip.file(file.path, file.content);
    } else {
      zip.file(file.path, Buffer.from(file.content, "base64"));
    }
    fileCount += 1;
  }

  for (const asset of await listAssets(projectId)) {
    const comma = asset.dataUrl.indexOf(",");
    if (comma === -1) continue;
    const base64 = asset.dataUrl.slice(comma + 1);
    zip.file(`assets/${asset.name}`, Buffer.from(base64, "base64"));
    fileCount += 1;
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";

  return { buffer, filename: `${slug}.zip`, files: fileCount, bytes: buffer.byteLength };
}

export async function projectTextDump(projectId: string, paths: string[]): Promise<{ path: string; content: string }[]> {
  const output: { path: string; content: string }[] = [];
  for (const path of paths) {
    const content = await readProjectText(projectId, path);
    if (content !== null) output.push({ path, content });
  }
  return output;
}
