import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListAuditLogs } from "@/lib/admin";
import { AdminAuditClient } from "@/components/admin/admin-audit-client";

export const metadata = { title: "Admin · Audit Log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("audit.view");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    actorId: params.actor,
    action: params.action,
    targetType: params.target,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 50,
  };
  const result = await adminListAuditLogs(filters);
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminAuditClient
        logs={result.logs}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
