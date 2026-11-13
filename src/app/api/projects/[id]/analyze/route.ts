import { z } from "zod";
import { analyzeProject } from "@/lib/services/analysis";
import { prepareSession } from "@/lib/workspace/session";
import { runWithStore } from "@/lib/workspace/store";
import { json, parseBody, serverError } from "@/lib/api";
import type { ProjectAnalysis } from "@/lib/services/analysis";

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

const schema = z.object({
  workspace: z.object({
    project: z.object({
      id: z.string().min(6).max(64),
      name: z.string().max(120).optional(),
      description: z.string().max(600).optional(),
      stack: z.string().max(40).optional(),
      model: z.string().max(120).optional(),
    }),
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(300),
          content: z.string(),
          encoding: z.enum(["utf8", "base64"]).optional(),
        }),
      )
      .max(300),
  }),
});

/** Static checks for a workspace the browser owns. */
export async function POST(request: Request, { params }: Params) {
  await params;
  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  try {
    const session = await prepareSession(parsed.data.workspace);
    const analysis = await (runWithStore(session.store, () => analyzeProject(session.id)) as Promise<ProjectAnalysis>);
    return json({ analysis });
  } catch (error) {
    return serverError(error);
  }
}
