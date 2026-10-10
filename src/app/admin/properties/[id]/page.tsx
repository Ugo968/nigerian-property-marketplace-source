import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListModerationHistory } from "@/lib/admin";
import { createAdminClient } from "@/lib/db/supabase";
import { AdminPropertyDetailClient } from "@/components/admin/admin-property-detail-client";

export const metadata = { title: "Admin · Property detail" };

export default async function AdminPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdminPermission("properties.view");
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  const { data: propRow } = await admin
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!propRow) notFound();

  const { data: locationRow } = await admin
    .from("property_locations")
    .select("*")
    .eq("property_id", id)
    .maybeSingle();

  const { data: mediaRows } = await admin
    .from("property_media")
    .select("id, storage_path, media_type, file_name")
    .eq("property_id", id)
    .limit(20);

  const { data: reportRows } = await admin
    .from("reports")
    .select("id, reason, status, created_at")
    .eq("entity_type", "property")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const moderationHistory = await adminListModerationHistory("property", id);

  return (
    <AdminLayout>
      <AdminPropertyDetailClient
        property={propRow as never}
        location={locationRow as never}
        media={(mediaRows ?? []) as never}
        reports={(reportRows ?? []) as never}
        moderationHistory={moderationHistory}
      />
    </AdminLayout>
  );
}
