import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListUsers } from "@/lib/admin";
import { AdminUsersClient } from "@/components/admin/admin-users-client";

export const metadata = { title: "Admin · Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("users.view");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    q: params.q,
    role: params.role as "landlord" | "agent" | "company" | undefined,
    accountStatus: params.status as
      | "active"
      | "suspended"
      | "banned"
      | "pending"
      | "deactivated"
      | undefined,
    verificationState: params.verification,
    subscriptionTier: params.tier as "free" | "pro" | "premium" | undefined,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };

  const result = await adminListUsers(filters);
  if (!result) {
    return (
      <AdminLayout>
        <p>Database not configured.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminUsersClient
        users={result.users}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
