/**
 * One gate for every project scoped route.
 *
 * It checks the session, loads the live account, then proves that the project belongs to
 * that account. A project owned by somebody else answers 404, exactly like a project
 * that does not exist, so ids cannot be used to discover other people's work.
 */
import type { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireAccount, type AccountContext } from "@/lib/auth/require";
import { authorizeProject } from "./projects";
import { redisConfigured } from "./redis";

export async function requireProject(
  projectId: string,
): Promise<{ account: AccountContext; error?: never } | { account?: never; error: NextResponse }> {
  const gate = await requireAccount();
  if (gate.error) return { error: gate.error };

  const { user } = gate.account;
  if (redisConfigured()) {
    const access = await authorizeProject(projectId, user.id, user.role === "admin");
    if (!access.ok) return { error: errorResponse("Project tidak ditemukan.", 404) };
  }
  return { account: gate.account };
}
