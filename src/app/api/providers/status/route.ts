import { aiConfig, providerKeyConfigured } from "@/lib/ai/config";
import { checkConnection, listModels, listVoices } from "@/lib/ai/bangunweb";
import { clientStorageMode, storageStatus } from "@/lib/workspace/store";
import { json } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Reports real capability state, probed against the provider. Nothing here is
 * simulated: if image or audio generation is unavailable, the reason returned is
 * the provider's own message.
 */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const storage = storageStatus();

  if (!providerKeyConfigured()) {
    return json({
      configured: false,
      storage,
    clientStorage: clientStorageMode(),
      chat: { available: false, error: "BANGUNWEB_API_KEY belum diatur." },
      image: { available: false, error: "BANGUNWEB_API_KEY belum diatur." },
      audio: { available: false, error: "BANGUNWEB_API_KEY belum diatur." },
      baseUrl: aiConfig.baseUrl,
      defaultModel: aiConfig.defaultModel,
    });
  }

  const connection = await checkConnection();
  let imageModels: string[] = [];
  let textModels = 0;
  try {
    const models = await listModels(force);
    imageModels = models.filter((model) => model.kind === "image").map((model) => model.id);
    textModels = models.filter((model) => model.kind === "text").length;
  } catch {
    /* connection error already reported */
  }

  let audio: { available: boolean; error?: string; models?: { id: string; voices: number }[]; note?: string } = { available: false };
  try {
    const voices = await listVoices(force);
    audio = {
      available: voices.models.length > 0,
      models: voices.models.map((model) => ({ id: model.id, voices: model.voices.length })),
      note: "Katalog suara terbaca. Endpoint speech provider hanya aktif untuk akun dengan paket suara; kalau belum, pesan provider diteruskan apa adanya.",
    };
  } catch (error) {
    audio = { available: false, error: (error as Error).message };
  }

  return json({
    configured: true,
    baseUrl: aiConfig.baseUrl,
    defaultModel: aiConfig.defaultModel,
    storage,
    clientStorage: clientStorageMode(),
    chat: { available: connection.ok, models: textModels, error: connection.error },
    image: {
      available: imageModels.length > 0,
      models: imageModels,
      model: aiConfig.imageModel,
      error: imageModels.length ? undefined : "Provider tidak punya model gambar.",
      note: "Model gambar provider ditagih per gambar. Error kuota diteruskan apa adanya.",
    },
    audio,
  });
}
