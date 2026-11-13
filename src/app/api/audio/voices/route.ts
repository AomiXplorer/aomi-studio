import { listVoices } from "@/lib/ai/bangunweb";
import { providerKeyConfigured } from "@/lib/ai/config";
import { json, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!providerKeyConfigured()) return json({ configured: false, models: [] });
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const catalog = await listVoices(force);
    return json({ configured: true, defaultVoice: catalog.defaultVoice, models: catalog.models });
  } catch (error) {
    return serverError(error);
  }
}
