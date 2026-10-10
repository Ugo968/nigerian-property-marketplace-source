import { notFound, redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminGetUserDetail } from "@/lib/admin";
import { AdminUserDetailClient } from "@/components/admin/admin-user-detail-client";

export const metadata = { title: "Admin · User detail" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdminPermission("users.view");
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const detail = await adminGetUserDetail(id);
  if (!detail) {
    notFound();
  }

  return (
    <AdminLayout>
      <AdminUserDetailClient detail={detail} />
    </AdminLayout>
  );
}
