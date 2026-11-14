/**
 * Step 1 of the checkout: is this address allowed to buy?
 *
 * Only the format and the uniqueness of the address are answered, in one readable sentence.
 */
import { z } from "zod";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { sameOrigin } from "@/lib/auth/require";
import { emailAvailable } from "@/lib/db/users";
import { countHit, clientIpHash, emailProblem, normaliseEmail } from "@/lib/payments/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().max(254) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origin tidak diizinkan.", 403);

  const limit = await countHit(`aomi:purchase:checkemail:${clientIpHash(request)}`, 40, 60);
  if (!limit.ok) {
    const response = errorResponse("Terlalu banyak percobaan. Tunggu sebentar.", 429);
    response.headers.set("Retry-After", String(limit.retryAfter));
    return response;
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  const problem = emailProblem(parsed.data.email);
  if (problem) return errorResponse(problem, 400);

  const email = normaliseEmail(parsed.data.email);
  try {
    const available = await emailAvailable(email);
    if (!available) {
      return errorResponse("Email ini sudah terdaftar. Langsung login saja.", 409);
    }
    return json({ ok: true, email });
  } catch (error) {
    return serverError(error);
  }
}
