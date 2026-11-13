import { z } from "zod";
import { generateSpeech } from "@/lib/ai/bangunweb";
import { aiConfig, providerKeyConfigured } from "@/lib/ai/config";
import { getProject, newId, saveAsset } from "@/lib/workspace/service";
import { clientKey, rateLimit } from "@/lib/services/rate-limit";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  text: z.string().min(1).max(5000),
  projectId: z.string().min(6).max(64).optional(),
  model: z.string().max(120).optional(),
  voice: z.string().max(80).optional(),
  format: z.enum(["mp3", "wav", "opus", "aac", "flac"]).optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

export async function POST(request: Request) {
  if (!providerKeyConfigured()) return errorResponse("BANGUNWEB_API_KEY belum diatur.", 500, { code: "not_configured" });
  const limit = rateLimit(clientKey(request, "audio"), Math.max(3, Math.floor(aiConfig.rateLimitPerMin / 4)));
  if (!limit.ok) return errorResponse("Terlalu banyak permintaan audio. Coba lagi sebentar.", 429, { retryAfter: limit.retryAfter });

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  try {
    const result = await generateSpeech({
      input: parsed.data.text,
      model: parsed.data.model,
      voice: parsed.data.voice,
      format: parsed.data.format,
      speed: parsed.data.speed,
    });
    let asset = null;
    if (parsed.data.projectId) {
      const project = await getProject(parsed.data.projectId);
      if (project) {
        const extension = parsed.data.format || "mp3";
        asset = await saveAsset(project.id, {
          id: newId(),
          kind: "audio",
          name: `aomi-voice-${Date.now()}.${extension}`,
          mime: result.mime,
          dataUrl: result.dataUrl,
          prompt: parsed.data.text.slice(0, 4000),
          model: result.model,
          voice: result.voice,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return json({ dataUrl: result.dataUrl, mime: result.mime, model: result.model, voice: result.voice, asset });
  } catch (error) {
    return serverError(error);
  }
}
