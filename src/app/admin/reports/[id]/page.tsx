import { notFound, redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminGetReport } from "@/lib/admin";
import { AdminReportDetailClient } from "@/components/admin/admin-report-detail-client";

export const metadata = { title: "Admin · Report detail" };

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdminPermission("reports.manage");
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const detail = await adminGetReport(id);
  if (!detail) notFound();

  return (
    <AdminLayout>
      <AdminReportDetailClient
        report={detail.report}
        moderationHistory={detail.moderationHistory}
      />
    </AdminLayout>
  );
}
