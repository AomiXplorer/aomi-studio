import { getMessages } from "@/lib/workspace/service";
import { json, serverError } from "@/lib/api";
import { requireProject } from "@/lib/db/guard";
import { getMessages as getCloudMessages } from "@/lib/db/projects";
import { redisConfigured } from "@/lib/db/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Conversation history. The workspace store answers when it holds the thread; otherwise
 * the cloud copy is returned, which is what restores a conversation after a deploy, a
 * restart or on another device.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;

  try {
    const local = await getMessages(id);
    if (local.length > 0) return json({ messages: local, source: "workspace" });

    if (redisConfigured()) {
      const limit = Number(new URL(request.url).searchParams.get("limit") || 60);
      const cloud = await getCloudMessages(id, limit);
      const messages = cloud.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));
      return json({ messages, source: "database" });
    }
    return json({ messages: [], source: "workspace" });
  } catch (error) {
    return serverError(error);
  }
}
