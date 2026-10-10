import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/db/supabase";
import { AdminVerificationDetailClient } from "@/components/admin/admin-verification-detail-client";

export const metadata = { title: "Admin · Verification application" };

export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdminPermission("verification.review");
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  const { data: appRow } = await admin
    .from("verification_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!appRow) notFound();

  const { data: docRows } = await admin
    .from("verification_documents")
    .select("id, document_type, storage_path, file_name, uploaded_at")
    .eq("application_id", id);

  const { data: historyRows } = await admin
    .from("verification_history")
    .select("*")
    .eq("application_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <AdminLayout>
      <AdminVerificationDetailClient
        application={appRow as never}
        documents={(docRows ?? []) as never}
        history={(historyRows ?? []) as never}
      />
    </AdminLayout>
  );
}
