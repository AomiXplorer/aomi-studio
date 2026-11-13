import { z } from "zod";
import type { TokenUsage, ToolDefinition } from "@/lib/ai/types";

export interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
}

export interface ToolResult {
  ok: boolean;
  /** One short line shown in the chat timeline. */
  summary: string;
  /** JSON payload handed back to the model. */
  data?: unknown;
  error?: string;
  filesChanged?: FileChange[];
  usage?: TokenUsage | null;
}

export interface ToolContext {
  projectId: string;
  model: string;
  signal?: AbortSignal;
  /** Route used by tools that need their own model call. */
  complete: (prompt: string, options?: { system?: string; maxTokens?: number }) => Promise<{ text: string; usage: TokenUsage | null }>;
}

export interface AgentTool<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: Schema;
  category: "filesystem" | "project" | "code";
  execute: (args: z.infer<Schema>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Narrows the generic so `execute` args are inferred from the zod schema. */
export function defineTool<S extends z.ZodTypeAny>(tool: AgentTool<S>): AgentTool {
  return tool as unknown as AgentTool;
}

export const TOOL_TIMEOUT_MS = 120_000;

// Strip meta keys that some OpenAI-compatible routers reject inside tool parameters.
function stripMeta(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripMeta);
  if (node && typeof node === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$schema" || key === "additionalProperties") continue;
      output[key] = stripMeta(value);
    }
    return output;
  }
  return node;
}

export function toToolDefinition(tool: AgentTool): ToolDefinition {
  const json = z.toJSONSchema(tool.schema, { io: "input" }) as Record<string, unknown>;
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: stripMeta(json) as Record<string, unknown>,
    },
  };
}
