import { z } from "zod";
import { aiConfig, providerKeyConfigured } from "@/lib/ai/config";
import { runAgent, type AgentEvent } from "@/lib/agent/engine";
import type { ChatMessage } from "@/lib/ai/types";
import {
  appendMessage,
  getMessages,
  getProject,
  newId,
  touchProject,
  type StoredMessage,
} from "@/lib/workspace/service";
import { clientKey, rateLimit } from "@/lib/services/rate-limit";
import { errorResponse, parseBody } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const schema = z.object({
  projectId: z.string().min(6).max(64),
  message: z.string().min(1).max(24_000),
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  attachments: z.array(z.object({ name: z.string().max(160), path: z.string().max(300) })).max(6).optional(),
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
  const { projectId, message, model, temperature, attachments } = parsed.data;

  const project = await getProject(projectId);
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
  await appendMessage(projectId, userMessage);
  await touchProject(projectId, { model: model || project.model });

  const history = toHistory(await getMessages(projectId));
  history.pop(); // the message we just stored is passed separately

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => {
    console.log("[aomi] request signal aborted:", String(request.signal.reason));
    abort.abort();
  });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent | { type: "user_saved"; message: StoredMessage }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "user_saved", message: userMessage });

      try {
        const result = await runAgent({
          projectId,
          model: model || project.model || aiConfig.defaultModel,
          history,
          userMessage: message + attachmentNote,
          temperature,
          signal: abort.signal,
          emit: send,
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
        await appendMessage(projectId, assistant);
        send({ type: "assistant_saved", message: assistant } as unknown as AgentEvent);
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
        if (!closed) {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            /* stream already gone */
          }
          closed = true;
        }
      }
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
