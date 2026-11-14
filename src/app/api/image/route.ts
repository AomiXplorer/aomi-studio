import { z } from "zod";
import { generateImage } from "@/lib/ai/bangunweb";
import { applyProviderKey } from "@/lib/ai/keys";
import { aiConfig, providerKeyConfigured } from "@/lib/ai/config";
import { getProject, newId, saveAsset } from "@/lib/workspace/service";
import { clientKey, rateLimit } from "@/lib/services/rate-limit";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";

export const runtime = "nodejs";
// Vercel rejects values above 60 for this plan tier (verified by deploy), so the
// streaming route gets the maximum the platform allows.
export const maxDuration = 60;

const schema = z.object({
  prompt: z.string().min(3).max(4000),
  projectId: z.string().min(6).max(64).optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:2", "2:3"]).optional(),
  model: z.string().max(120).optional(),
  saveToProject: z.boolean().optional(),
});

export async function POST(request: Request) {
  const gate = await requireSession();
  if (gate.error) return gate.error;
  await applyProviderKey();

  if (!providerKeyConfigured()) return errorResponse("BANGUNWEB_API_KEY belum diatur.", 500, { code: "not_configured" });
  const limit = rateLimit(clientKey(request, "image"), Math.max(3, Math.floor(aiConfig.rateLimitPerMin / 4)));
  if (!limit.ok) return errorResponse("Terlalu banyak permintaan gambar. Coba lagi sebentar.", 429, { retryAfter: limit.retryAfter });

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  try {
    const result = await generateImage({ prompt: parsed.data.prompt, model: parsed.data.model, aspectRatio: parsed.data.aspectRatio });
    let asset = null;
    if (parsed.data.projectId && parsed.data.saveToProject !== false) {
      const project = await getProject(parsed.data.projectId);
      if (project) {
        const extension = result.dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
        asset = await saveAsset(project.id, {
          id: newId(),
          kind: "image",
          name: `aomi-${Date.now()}.${extension}`,
          mime: `image/${extension === "jpg" ? "jpeg" : "png"}`,
          dataUrl: result.dataUrl,
          prompt: parsed.data.prompt,
          model: result.model,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return json({ dataUrl: result.dataUrl, model: result.model, revisedPrompt: result.revisedPrompt, asset });
  } catch (error) {
    return serverError(error);
  }
}
