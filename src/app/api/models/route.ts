import { listModels } from "@/lib/ai/bangunweb";
import { applyProviderKey } from "@/lib/ai/keys";
import { providerKeyConfigured, aiConfig } from "@/lib/ai/config";
import { json, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireSession();
  if (gate.error) return gate.error;
  await applyProviderKey();

  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  if (!providerKeyConfigured()) {
    return json({ configured: false, models: [], defaultModel: aiConfig.defaultModel });
  }
  try {
    const models = await listModels(force);
    return json({
      configured: true,
      defaultModel: aiConfig.defaultModel,
      imageModel: aiConfig.imageModel,
      audioModel: aiConfig.audioModel,
      audioVoice: aiConfig.audioVoice,
      models,
    });
  } catch (error) {
    return serverError(error);
  }
}
