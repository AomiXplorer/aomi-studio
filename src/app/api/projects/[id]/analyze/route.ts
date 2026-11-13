import { analyzeProject } from "@/lib/services/analysis";
import { json, serverError } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    return json({ analysis: await analyzeProject(id) });
  } catch (error) {
    return serverError(error);
  }
}
