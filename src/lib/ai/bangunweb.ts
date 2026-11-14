import { aiConfig, providerKeyConfigured } from "./config";
import { brandLabel } from "./labels";
import {
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  ImageRequest,
  ImageResult,
  ProviderError,
  ProviderErrorCode,
  ProviderModel,
  SpeechRequest,
  SpeechResult,
  TokenUsage,
  ToolCall,
} from "./types";

/**
 * BangunWeb router adapter.
 *
 * Verified against https://router.bangunweb.com/v1 on 2026-11-14:
 *  - auth: `Authorization: Bearer <key>`
 *  - chat: POST /v1/chat/completions, OpenAI-compatible body, SSE when stream=true
 *    (stream sends `: keep-alive` comments), tool_calls supported, `reasoning_content`
 *    returned by reasoning models
 *  - models: GET /v1/models returns `bangunweb` metadata (kind, vision, tier, endpoint)
 *  - images: POST /v1/images/generations (billed 2,000,000 tokens per image)
 *  - audio: POST /v1/audio/speech + GET /v1/audio/voices (requires a purchased token plan)
 *  - errors: { error: { message, type, code } } with matching HTTP status
 */

const ERROR_CODES: Record<string, ProviderErrorCode> = {
  authentication_error: "authentication_error",
  invalid_api_key: "authentication_error",
  insufficient_quota: "insufficient_quota",
  purchase_required: "purchase_required",
  model_not_found: "model_not_found",
  rate_limit_exceeded: "rate_limit",
  unsupported: "unsupported",
};

function mapError(status: number, code: string | undefined, message: string): ProviderError {
  const mapped =
    (code && ERROR_CODES[code]) ||
    (status === 401 || status === 403 ? "authentication_error" : undefined) ||
    (status === 402 ? "insufficient_quota" : undefined) ||
    (status === 404 ? "model_not_found" : undefined) ||
    (status === 429 ? "rate_limit" : undefined) ||
    (status >= 500 ? "network_error" : "unknown");
  return new ProviderError(mapped as ProviderErrorCode, message, status);
}

function headers(): Record<string, string> {
  if (!providerKeyConfigured()) {
    throw new ProviderError("not_configured", "BANGUNWEB_API_KEY belum diatur di environment server.");
  }
  return {
    Authorization: `Bearer ${aiConfig.apiKey}`,
    "Content-Type": "application/json",
  };
}

const url = (path: string) => `${aiConfig.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

async function readError(res: Response): Promise<ProviderError> {
  let message = `Provider merespons ${res.status}`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string; type?: string } };
    message = body?.error?.message || message;
    code = body?.error?.code || body?.error?.type;
  } catch {
    /* non-JSON error body */
  }
  return mapError(res.status, code, message);
}

function normalizeUsage(raw: Record<string, unknown> | null | undefined): TokenUsage | null {
  if (!raw) return null;
  const promptTokens = Number(raw.prompt_tokens ?? 0);
  const completionTokens = Number(raw.completion_tokens ?? 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: Number(raw.total_tokens ?? promptTokens + completionTokens),
    billedTokens: Number(raw.billed_tokens ?? promptTokens + completionTokens),
  };
}

interface RawModel {
  id: string;
  display_name?: string;
  bangunweb?: {
    kind?: string;
    vision?: boolean;
    tier?: string;
    default?: boolean;
    endpoint?: string;
    family?: string;
    description?: string;
    tagline?: string;
  };
}

let modelCache: { at: number; models: ProviderModel[] } | null = null;

export async function listModels(force = false): Promise<ProviderModel[]> {
  if (!force && modelCache && Date.now() - modelCache.at < 5 * 60 * 1000) return modelCache.models;
  const res = await fetch(url("/models"), { headers: headers(), cache: "no-store" });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { data?: RawModel[] };
  const models: ProviderModel[] = (body.data ?? []).map((raw) => {
    const meta = raw.bangunweb ?? {};
    const kind = meta.kind === "image" ? "image" : meta.kind === "audio" ? "audio" : "text";
    return {
      id: raw.id,
      label: brandLabel(raw.display_name || raw.id),
      family: brandLabel(meta.family || "Unknown"),
      kind,
      vision: Boolean(meta.vision),
      tier: meta.tier ?? null,
      isDefault: Boolean(meta.default),
      endpoint: meta.endpoint ?? null,
      note: meta.description || meta.tagline ? brandLabel(meta.description || meta.tagline || "") : null,
    };
  });
  modelCache = { at: Date.now(), models };
  return models;
}

export interface StreamSink {
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

/** Streams a chat completion and returns the fully assembled message. */
export async function streamChat(req: ChatRequest, sink: StreamSink): Promise<ChatResult> {
  const res = await fetch(url("/chat/completions"), {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    signal: sink.signal,
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      tools: req.tools?.length ? req.tools : undefined,
      tool_choice: req.tools?.length ? "auto" : undefined,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  let model = req.model;
  let usage: TokenUsage | null = null;
  const toolCalls: ToolCall[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; `:` lines are keep-alive comments.
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      for (const line of frame.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: {
          model?: string;
          choices?: {
            delta?: {
              content?: string;
              reasoning_content?: string;
              tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
            };
            finish_reason?: string | null;
          }[];
          usage?: Record<string, unknown>;
        };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.model && chunk.model !== model) {
          model = chunk.model;
          sink.onEvent({ type: "model", model });
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          content += delta.content;
          sink.onEvent({ type: "text", delta: delta.content });
        }
        if (delta?.reasoning_content) {
          reasoning += delta.reasoning_content;
          sink.onEvent({ type: "reasoning", delta: delta.reasoning_content });
        }
        if (delta?.tool_calls) {
          for (const call of delta.tool_calls) {
            const index = call.index ?? toolCalls.length;
            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: call.id || `call_${index}`,
                type: "function",
                function: { name: call.function?.name || "", arguments: "" },
              };
            }
            if (call.id) toolCalls[index].id = call.id;
            if (call.function?.name) toolCalls[index].function.name = call.function.name;
            if (call.function?.arguments) toolCalls[index].function.arguments += call.function.arguments;
          }
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          const parsed = normalizeUsage(chunk.usage);
          if (parsed) {
            usage = parsed;
            sink.onEvent({ type: "usage", usage: parsed });
          }
        }
      }
    }
  }

  const cleanedCalls = toolCalls.filter((call) => call && call.function.name);
  sink.onEvent({ type: "done", finishReason });
  return {
    content: content || null,
    reasoning: reasoning || null,
    toolCalls: cleanedCalls,
    usage,
    model,
    finishReason,
  };
}

export async function completeChat(req: ChatRequest): Promise<ChatResult> {
  const res = await fetch(url("/chat/completions"), {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: false,
    }),
  });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
    usage?: Record<string, unknown>;
  };
  const choice = body.choices?.[0];
  return {
    content: choice?.message?.content ?? null,
    reasoning: choice?.message?.reasoning_content ?? null,
    toolCalls: [],
    usage: normalizeUsage(body.usage),
    model: body.model || req.model,
    finishReason: choice?.finish_reason ?? null,
  };
}

const RATIO_TO_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "4:3": "1344x1008",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};

export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const model = req.model || aiConfig.imageModel;
  const size = RATIO_TO_SIZE[req.aspectRatio || "1:1"] || "1024x1024";
  const aspectHint = req.aspectRatio ? `\n\nComposition: ${req.aspectRatio} aspect ratio.` : "";

  const attempt = async (body: Record<string, unknown>) => {
    const res = await fetch(url("/images/generations"), {
      method: "POST",
      headers: headers(),
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await readError(res);
    return (await res.json()) as {
      model?: string;
      data?: { url?: string; b64_json?: string; revised_prompt?: string }[];
    };
  };

  let payload: { data?: { url?: string; b64_json?: string; revised_prompt?: string }[]; model?: string };
  try {
    payload = await attempt({ model, prompt: req.prompt, size, n: 1 });
  } catch (error) {
    // Some routers reject OpenAI-only fields. Retry once with the minimal body
    // and carry the aspect hint inside the prompt instead.
    if (error instanceof ProviderError && (error.status === 400 || error.code === "unsupported")) {
      payload = await attempt({ model, prompt: `${req.prompt}${aspectHint}` });
    } else {
      throw error;
    }
  }

  const first = payload.data?.[0];
  if (!first) throw new ProviderError("bad_response", "Provider tidak mengembalikan gambar.");
  let dataUrl: string;
  if (first.b64_json) {
    dataUrl = `data:image/png;base64,${first.b64_json}`;
  } else if (first.url) {
    const imageRes = await fetch(first.url);
    if (!imageRes.ok) throw new ProviderError("bad_response", "Gagal mengunduh hasil gambar dari provider.");
    const mime = imageRes.headers.get("content-type") || "image/png";
    const bytes = Buffer.from(await imageRes.arrayBuffer()).toString("base64");
    dataUrl = `data:${mime};base64,${bytes}`;
  } else {
    throw new ProviderError("bad_response", "Respons gambar tidak berisi url atau b64_json.");
  }

  return { dataUrl, model, revisedPrompt: first.revised_prompt ?? null };
}

export interface ProviderVoice {
  id: string;
  name: string;
  description: string | null;
  gender: string | null;
  accent: string | null;
}

export interface ProviderAudioModel {
  id: string;
  tokensPerCharacter: number | null;
  voices: ProviderVoice[];
}

let voiceCache: { at: number; models: ProviderAudioModel[]; defaultVoice: string | null } | null = null;

export async function listVoices(force = false) {
  if (!force && voiceCache && Date.now() - voiceCache.at < 10 * 60 * 1000) return voiceCache;
  const res = await fetch(url("/audio/voices"), { headers: headers(), cache: "no-store" });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as {
    default?: string;
    models?: {
      id: string;
      tokens_per_character?: number;
      voices?: { id: string; name?: string; description?: string; gender?: string; accent?: string }[];
    }[];
  };
  const models: ProviderAudioModel[] = (body.models ?? []).map((model) => ({
    id: model.id,
    tokensPerCharacter: model.tokens_per_character ?? null,
    voices: (model.voices ?? []).map((voice) => ({
      id: voice.id,
      name: voice.name || voice.id,
      description: voice.description ?? null,
      gender: voice.gender ?? null,
      accent: voice.accent ?? null,
    })),
  }));
  voiceCache = { at: Date.now(), models, defaultVoice: body.default ?? null };
  return voiceCache;
}

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
};

export async function generateSpeech(req: SpeechRequest): Promise<SpeechResult> {
  const model = req.model || aiConfig.audioModel;
  const voice = req.voice || aiConfig.audioVoice;
  const format = req.format || "mp3";
  const res = await fetch(url("/audio/speech"), {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({ model, input: req.input, voice, response_format: format, speed: req.speed }),
  });
  if (!res.ok) throw await readError(res);
  const mime = res.headers.get("content-type") || AUDIO_MIME[format] || "audio/mpeg";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new ProviderError("bad_response", "Provider mengembalikan audio kosong.");
  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    mime,
    model,
    voice,
  };
}

export async function checkConnection(): Promise<{ ok: boolean; models: number; error?: string }> {
  try {
    const models = await listModels(true);
    return { ok: true, models: models.length };
  } catch (error) {
    return { ok: false, models: 0, error: error instanceof Error ? error.message : "Gagal terhubung" };
  }
}
