import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/db/supabase";
import { AdminReviewDetailClient } from "@/components/admin/admin-review-detail-client";

export const metadata = { title: "Admin · Review" };

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdminPermission("reviews.moderate");
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  const { data: reviewRow } = await admin
    .from("reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!reviewRow) notFound();

  const { data: reportRows } = await admin
    .from("reports")
    .select("id, reason, status, created_at")
    .eq("entity_type", "review")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AdminLayout>
      <AdminReviewDetailClient
        review={reviewRow as never}
        reports={(reportRows ?? []) as never}
      />
    </AdminLayout>
  );
}
