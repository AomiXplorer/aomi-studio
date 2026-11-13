import { streamChat } from "@/lib/ai/bangunweb";
import type { ChatMessage, TokenUsage } from "@/lib/ai/types";
import { listProjectFiles, getProject, type ProjectMeta, type StoredToolCall } from "@/lib/workspace/service";
import type { FileChange } from "./tools/types";
import { runTool, toolDefinitions } from "./tools";
import { buildSystemPrompt } from "./prompt";

export type AgentStatus =
  | "thinking"
  | "planning"
  | "writing"
  | "editing"
  | "checking"
  | "building"
  | "completed"
  | "failed";

export type AgentEvent =
  | { type: "status"; status: AgentStatus; detail?: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "model"; model: string }
  | { type: "tool_start"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; id: string; name: string; ok: boolean; summary: string; data?: unknown }
  | { type: "file_changed"; change: FileChange }
  | { type: "usage"; usage: TokenUsage }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; status: AgentStatus };

export interface RunAgentOptions {
  projectId: string;
  model: string;
  history: ChatMessage[];
  userMessage: string;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  temperature?: number;
  tokenBudget?: number;
}

export interface RunAgentResult {
  content: string;
  reasoning: string | null;
  toolCalls: StoredToolCall[];
  usage: TokenUsage | null;
  fileChanges: FileChange[];
  model: string;
  status: "completed" | "failed";
  error?: string;
  steps: number;
}

const WRITE_TOOLS = new Set(["create_file", "write_file", "edit_file", "delete_file", "rename_file", "generate_project"]);
const CODE_TOOLS = new Set(["analyze_code", "debug_code", "refactor_code", "review_code", "explain_code"]);
const CHECK_TOOLS = new Set(["analyze_project", "inspect_structure"]);

function addUsage(total: TokenUsage | null, next: TokenUsage | null): TokenUsage | null {
  if (!next) return total;
  if (!total) return { ...next };
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    billedTokens: total.billedTokens + next.billedTokens,
  };
}

/**
 * The agent loop: stream a model turn, execute every requested tool for real,
 * feed the results back, repeat until the model stops calling tools or a
 * guardrail trips.
 */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const { projectId, model, history, userMessage, emit, signal } = options;
  const maxSteps = Math.min(options.maxSteps ?? 14, 24);
  const tokenBudget = options.tokenBudget ?? 600_000;

  const project: ProjectMeta | null = await getProject(projectId);
  if (!project) throw new Error("Project tidak ditemukan.");
  const files = await listProjectFiles(projectId);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ project, files: files.map((file) => ({ path: file.path, size: file.size })) }) },
    ...history,
    { role: "user", content: userMessage },
  ];

  const tools = toolDefinitions();
  const collected: StoredToolCall[] = [];
  const fileChanges: FileChange[] = [];
  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  let usage: TokenUsage | null = null;
  let activeModel = model;
  let steps = 0;
  let status: "completed" | "failed" = "completed";
  let errorMessage: string | undefined;

  const context = {
    projectId,
    model: activeModel,
    signal,
    complete: async (prompt: string, opts?: { system?: string; maxTokens?: number }) => {
      const { completeChat } = await import("@/lib/ai/bangunweb");
      const result = await completeChat({
        model: activeModel,
        messages: [
          { role: "system", content: opts?.system ?? "You are Aomi, a precise code analysis engine." },
          { role: "user", content: prompt },
        ],
        maxTokens: opts?.maxTokens ?? 1500,
        temperature: 0.2,
      });
      usage = addUsage(usage, result.usage);
      if (result.usage) emit({ type: "usage", usage: result.usage });
      return { text: result.content ?? "", usage: result.usage };
    },
  };

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (signal?.aborted) {
        status = "failed";
        errorMessage = "Dibatalkan oleh pengguna.";
        break;
      }
      steps = step + 1;
      emit({ type: "status", status: step === 0 ? "thinking" : "planning", detail: `Langkah ${step + 1}` });

      const turn = await streamChat(
        { model: activeModel, messages, tools, temperature: options.temperature ?? 0.3, maxTokens: 8000 },
        {
          signal,
          onEvent: (event) => {
            if (event.type === "text") emit({ type: "text", delta: event.delta });
            else if (event.type === "reasoning") emit({ type: "reasoning", delta: event.delta });
            else if (event.type === "model") {
              activeModel = event.model;
              emit({ type: "model", model: event.model });
            } else if (event.type === "usage") emit({ type: "usage", usage: event.usage });
          },
        },
      );

      usage = addUsage(usage, turn.usage);
      if (turn.content) textParts.push(turn.content);
      if (turn.reasoning) reasoningParts.push(turn.reasoning);

      if (!turn.toolCalls.length) break;

      messages.push({ role: "assistant", content: turn.content, tool_calls: turn.toolCalls });

      for (const call of turn.toolCalls) {
        if (signal?.aborted) {
          status = "failed";
          errorMessage = "Dibatalkan oleh pengguna.";
          break;
        }
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        const name = call.function.name;
        const nextStatus: AgentStatus = WRITE_TOOLS.has(name)
          ? "writing"
          : CODE_TOOLS.has(name) && name !== "analyze_code"
            ? "editing"
            : CHECK_TOOLS.has(name)
              ? "checking"
              : "thinking";
        emit({ type: "status", status: nextStatus, detail: name });
        emit({ type: "tool_start", id: call.id, name, args });

        const result = await runTool(name, call.function.arguments, context);
        emit({ type: "tool_end", id: call.id, name, ok: result.ok, summary: result.summary, data: result.ok ? result.data : { error: result.error } });

        for (const change of result.filesChanged ?? []) {
          fileChanges.push(change);
          emit({ type: "file_changed", change });
        }
        collected.push({
          name,
          status: result.ok ? "success" : "error",
          summary: result.summary,
          args: Object.fromEntries(Object.entries(args).slice(0, 6).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 160) : value])),
        });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify({
            ok: result.ok,
            summary: result.summary,
            ...(result.ok ? { data: result.data } : { error: result.error }),
          }).slice(0, 40_000),
        });
      }

      if (usage && usage.billedTokens > tokenBudget) {
        status = "failed";
        errorMessage = `Batas token sesi tercapai (${usage.billedTokens.toLocaleString("id-ID")}). Pekerjaan dihentikan agar tidak membakar kuota.`;
        emit({ type: "status", status: "failed", detail: errorMessage });
        break;
      }
      if (status === "failed") break;
    }
  } catch (error) {
    status = "failed";
    errorMessage = (error as Error).message;
    emit({ type: "error", message: errorMessage, code: (error as { code?: string }).code });
  }

  const content = textParts.join("\n\n").trim();
  emit({ type: "status", status: status === "completed" ? "completed" : "failed", detail: status === "completed" ? undefined : errorMessage });
  emit({ type: "done", status });

  return {
    content,
    reasoning: reasoningParts.length ? reasoningParts.join("\n\n") : null,
    toolCalls: collected,
    usage,
    fileChanges,
    model: activeModel,
    status,
    error: errorMessage,
    steps,
  };
}
