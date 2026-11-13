import type { ToolDefinition } from "@/lib/ai/types";
import { codeTools } from "./code";
import { filesystemTools } from "./filesystem";
import { projectTools } from "./project";
import { toToolDefinition, type AgentTool, type ToolContext, type ToolResult } from "./types";

export const AGENT_TOOLS: AgentTool[] = [...filesystemTools, ...projectTools, ...codeTools];

const toolMap = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export function toolDefinitions(): ToolDefinition[] {
  return AGENT_TOOLS.map(toToolDefinition);
}

export function toolNames(): string[] {
  return AGENT_TOOLS.map((tool) => tool.name);
}

export function getTool(name: string): AgentTool | undefined {
  return toolMap.get(name);
}

/** Validates arguments against the tool schema and executes it. Never throws. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult & { name: string; args: Record<string, unknown> }> {
  const tool = getTool(name);
  if (!tool) {
    return { name, args: {}, ok: false, summary: `Tool "${name}" tidak dikenal`, error: `Tool ${name} tidak terdaftar.` };
  }
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = rawArgs?.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch (error) {
    return { name, args: {}, ok: false, summary: "Argumen bukan JSON valid", error: `Argumen tool tidak bisa diparse: ${(error as Error).message}` };
  }
  const validation = tool.schema.safeParse(parsedArgs);
  if (!validation.success) {
    const issues = validation.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    return { name, args: parsedArgs, ok: false, summary: "Parameter tidak valid", error: issues };
  }
  try {
    const result = await tool.execute(validation.data, ctx);
    return { ...result, name, args: parsedArgs };
  } catch (error) {
    return { name, args: parsedArgs, ok: false, summary: `Tool gagal: ${(error as Error).message.slice(0, 160)}`, error: (error as Error).message };
  }
}

export type { ToolContext, ToolResult };
