import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const metadata = { title: "Admin — Aomi" };
export const dynamic = "force-dynamic";

/** Server-side role gate: a non-admin never receives the panel markup at all. */
export default async function AdminPage() {
  const gate = await requireAdmin();
  if (gate.error) {
    if (gate.error.status === 403) redirect("/chat");
    redirect("/login?next=/admin");
  }
  return <AdminConsole />;
}
