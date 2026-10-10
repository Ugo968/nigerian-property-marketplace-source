import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  requireAdminPermission,
  adminListNotifications,
  adminListEmailDelivery,
} from "@/lib/admin";
import { AdminNotificationsClient } from "@/components/admin/admin-notifications-client";

export const metadata = { title: "Admin · Notifications" };

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("notifications.manage");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    type: params.type,
    channel: params.channel,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const emailFilters = {
    status: params.email_status,
    template: params.email_template,
    page: 1,
    pageSize: 10,
  };
  const result = await adminListNotifications(filters);
  const emailResult = await adminListEmailDelivery(emailFilters);
  if (!result || !emailResult) {
    return <AdminLayout><p>Database not configured.</p></AdminLayout>;
  }

  return (
    <AdminLayout>
      <AdminNotificationsClient
        notifications={result.notifications}
        notificationsTotal={result.total}
        notificationsPage={result.page}
        notificationsPageSize={result.pageSize}
        emailRecords={emailResult.records}
        emailTotal={emailResult.total}
        emailPage={emailResult.page}
        emailPageSize={emailResult.pageSize}
        currentFilters={filters}
        currentEmailFilters={emailFilters}
      />
    </AdminLayout>
  );
}
