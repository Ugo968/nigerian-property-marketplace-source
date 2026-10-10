import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/db/supabase";
import { AdminApplicationsClient } from "@/components/admin/admin-applications-client";

export const metadata = { title: "Admin · Applications" };

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("applications.view");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const status = params.status;
  const page = params.page ? parseInt(params.page, 10) : 1;
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = createAdminClient();
  if (!admin) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  let query = admin.from("property_applications").select("*", { count: "exact" });
  if (status) query = query.eq("status", status);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;

  return (
    <AdminLayout>
      <AdminApplicationsClient
        applications={(data ?? []) as never}
        page={page}
        pageSize={pageSize}
        total={count ?? 0}
        currentStatus={status ?? "all"}
      />
    </AdminLayout>
  );
}
