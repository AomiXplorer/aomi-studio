import { json } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";
import { readQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets the UI show the maintenance line before a request ever fails. */
export async function GET() {
  const gate = await requireSession();
  if (gate.error) return gate.error;
  return json(await readQuota());
}
