import { Suspense } from "react";
import { WorkspaceView } from "@/components/workspace/WorkspaceView";

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Memuat workspace...</div>}>
      <WorkspaceView projectId={id} />
    </Suspense>
  );
}
