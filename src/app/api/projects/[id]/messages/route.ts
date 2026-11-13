import { getMessages } from "@/lib/workspace/service";
import { json, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const gate = await requireSession();
  if (gate.error) return gate.error;

  const { id } = await params;
  try {
    return json({ messages: await getMessages(id) });
  } catch (error) {
    return serverError(error);
  }
}
