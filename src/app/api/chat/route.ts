import { z } from "zod";
import { aiConfig, providerKeyConfigured } from "@/lib/ai/config";
import { runAgent, type AgentEvent } from "@/lib/agent/engine";
import type { ChatMessage } from "@/lib/ai/types";
import {
  appendMessage,
  getMessages,
  getProject,
  newId,
  replaceMessages,
  touchProject,
  type StoredMessage,
} from "@/lib/workspace/service";
import { runWithStore } from "@/lib/workspace/store";
import { prepareSession, snapshotSession, type Session } from "@/lib/workspace/session";
import { clientKey, rateLimit } from "@/lib/services/rate-limit";
import { errorResponse, parseBody, serverError } from "@/lib/api";

export const runtime = "nodejs";
// Vercel rejects values above 60 for this plan tier (verified by deploy), so the
// streaming route gets the maximum the platform allows.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  projectId: z.string().min(6).max(64),
  message: z.string().min(1).max(24_000),
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  attachments: z.array(z.object({ name: z.string().max(160), path: z.string().max(300) })).max(6).optional(),
  /** A follow-up slice of the same request, after the previous one hit the time budget. */
  continuation: z.boolean().optional(),
  /** Present in client storage mode: the browser owns the workspace. */
  workspace: z
    .object({
      project: z.object({
        id: z.string().min(6).max(64),
        name: z.string().max(120).optional(),
        description: z.string().max(600).optional(),
        stack: z.string().max(40).optional(),
        model: z.string().max(120).optional(),
      }),
      files: z
        .array(
          z.object({
            path: z.string().min(1).max(300),
            content: z.string(),
            encoding: z.enum(["utf8", "base64"]).optional(),
          }),
        )
        .max(300),
      messages: z.array(z.record(z.string(), z.unknown())).max(80).optional(),
    })
    .optional(),
});

function toHistory(messages: StoredMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-14)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content.slice(0, 6000) || (message.role === "assistant" ? "(tidak ada teks, hanya aksi tool)" : ""),
    }));
}

export async function POST(request: Request) {
  if (!providerKeyConfigured()) {
    return errorResponse("BANGUNWEB_API_KEY belum diatur di environment server.", 500, { code: "not_configured" });
  }

  const limit = rateLimit(clientKey(request, "chat"), aiConfig.rateLimitPerMin);
  if (!limit.ok) return errorResponse("Terlalu banyak permintaan. Coba lagi sebentar.", 429, { retryAfter: limit.retryAfter });

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  const { projectId, message, model, temperature, attachments, workspace } = parsed.data;
  const continuation = parsed.data.continuation === true;
  const budget = Math.min(Math.max(Number(process.env.AOMI_TURN_BUDGET_MS || 42_000), 8_000), 52_000);
  const deadlineAt = Date.now() + budget;

  let session: Session | null = null;
  if (workspace) {
    try {
      session = await prepareSession({
        project: workspace.project,
        files: workspace.files,
        messages: workspace.messages as unknown as StoredMessage[] | undefined,
      });
    } catch (error) {
      return serverError(error);
    }
  }

  /** Runs work inside the request-scoped store when the client owns the workspace. */
  const inScope = <T,>(fn: () => Promise<T>): Promise<T> =>
    session ? (runWithStore(session.store, fn) as Promise<T>) : fn();

  const project = await inScope(() => getProject(projectId));
  if (!project) return errorResponse("Project tidak ditemukan.", 404);

  const attachmentNote = attachments?.length
    ? `\n\n[Lampiran tersimpan di workspace: ${attachments.map((file) => file.path).join(", ")}]`
    : "";

  const userMessage: StoredMessage = {
    id: newId(),
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
    attachments: attachments?.map((file) => ({ name: file.name, path: file.path })),
  };
  if (!continuation) {
    await inScope(() => appendMessage(projectId, userMessage));
  }
  await inScope(() => touchProject(projectId, { model: model || project.model }));

  const history = toHistory(await inScope(() => getMessages(projectId)));
  if (!continuation) history.pop(); // the message we just stored is passed separately

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AgentEvent | { type: string; [key: string]: unknown }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          /* stream already gone */
        }
        closed = true;
      };

      void inScope(async () => {
        if (!continuation) send({ type: "user_saved", message: userMessage });

        try {
          const result = await runAgent({
            projectId,
            model: model || project.model || aiConfig.defaultModel,
            history,
            userMessage: message + attachmentNote,
            temperature,
            signal: abort.signal,
            deadlineAt,
            emit: send as (event: AgentEvent) => void,
          });

          const assistant: StoredMessage = {
            id: newId(),
            role: "assistant",
            content: result.content || (result.toolCalls.length ? "" : "Tidak ada respons dari model."),
            createdAt: new Date().toISOString(),
            model: result.model,
            usage: result.usage,
            toolCalls: result.toolCalls,
            status: result.status === "completed" ? "completed" : "failed",
          };
          if (continuation) {
            // Keep one answer bubble per request: continuation slices extend it.
            const stored = await inScope(() => getMessages(projectId));
            const last = stored[stored.length - 1];
            if (last && last.role === "assistant") {
              const merged: StoredMessage = {
                ...last,
                content: [last.content, assistant.content].filter(Boolean).join("\n\n"),
                toolCalls: [...(last.toolCalls ?? []), ...(assistant.toolCalls ?? [])],
                usage: assistant.usage ?? last.usage,
                status: assistant.status,
                model: assistant.model ?? last.model,
              };
              await inScope(() => replaceMessages(projectId, [...stored.slice(0, -1), merged]));
              send({ type: "assistant_saved", message: merged });
            } else {
              await appendMessage(projectId, assistant);
              send({ type: "assistant_saved", message: assistant });
            }
          } else {
            await appendMessage(projectId, assistant);
            send({ type: "assistant_saved", message: assistant });
          }
          if (result.paused) send({ type: "turn_paused", note: "Batas waktu permintaan tercapai, pekerjaan dilanjutkan otomatis." } as AgentEvent);
        } catch (error) {
          const failure: StoredMessage = {
            id: newId(),
            role: "assistant",
            content: `Gagal menjalankan agent: ${(error as Error).message}`,
            createdAt: new Date().toISOString(),
            status: "failed",
          };
          await appendMessage(projectId, failure).catch(() => undefined);
          send({ type: "error", message: (error as Error).message, code: (error as { code?: string }).code });
          send({ type: "done", status: "failed" });
        } finally {
          if (session) {
            // Hand the finished workspace back to the browser that owns it.
            try {
              const snapshot = await snapshotSession(session.store, projectId);
              send({ type: "workspace_snapshot", ...snapshot });
            } catch (error) {
              send({ type: "snapshot_failed", message: (error as Error).message });
            }
          }
          close();
        }
      });
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
