/**
 * Step 2 of the checkout: is this name still free?
 *
 * The same function the final write uses, so the answer here cannot disagree with the
 * answer at provisioning time.
 */
import { z } from "zod";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { sameOrigin } from "@/lib/auth/require";
import { usernameAvailable } from "@/lib/payments/provision";
import { clientIpHash, countHit } from "@/lib/payments/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ username: z.string().max(64) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origin tidak diizinkan.", 403);

  const limit = await countHit(`aomi:purchase:checkname:${clientIpHash(request)}`, 40, 60);
  if (!limit.ok) {
    const response = errorResponse("Terlalu banyak percobaan. Tunggu sebentar.", 429);
    response.headers.set("Retry-After", String(limit.retryAfter));
    return response;
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  try {
    const result = await usernameAvailable(parsed.data.username);
    if (!result.ok) return errorResponse(result.reason || "Username tidak bisa dipakai.", 409);
    return json({ ok: true, username: parsed.data.username.trim() });
  } catch (error) {
    return serverError(error);
  }
}
