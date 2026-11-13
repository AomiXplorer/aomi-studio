export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderModel {
  id: string;
  label: string;
  family: string;
  kind: "text" | "image" | "audio";
  vision: boolean;
  tier: string | null;
  isDefault: boolean;
  endpoint: string | null;
  note: string | null;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "model"; model: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; finishReason: string | null };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  billedTokens: number;
}

export interface ChatResult {
  content: string | null;
  reasoning: string | null;
  toolCalls: ToolCall[];
  usage: TokenUsage | null;
  model: string;
  finishReason: string | null;
}

export interface ImageRequest {
  prompt: string;
  model?: string;
  aspectRatio?: string;
}

export interface ImageResult {
  dataUrl: string;
  model: string;
  revisedPrompt: string | null;
}

export interface SpeechRequest {
  input: string;
  model?: string;
  voice?: string;
  format?: string;
  speed?: number;
}

export interface SpeechResult {
  dataUrl: string;
  mime: string;
  model: string;
  voice: string;
}

export type ProviderErrorCode =
  | "not_configured"
  | "authentication_error"
  | "insufficient_quota"
  | "purchase_required"
  | "model_not_found"
  | "rate_limit"
  | "unsupported"
  | "network_error"
  | "bad_response"
  | "aborted"
  | "unknown";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  status: number;

  constructor(code: ProviderErrorCode, message: string, status = 0) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}
