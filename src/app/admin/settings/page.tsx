import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListPlatformSettings, adminListReportCategories } from "@/lib/admin";
import { AdminSettingsClient } from "@/components/admin/admin-settings-client";

export const metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  try {
    await requireAdminPermission("settings.manage");
  } catch {
    redirect("/forbidden");
  }

  const [settings, categories] = await Promise.all([
    adminListPlatformSettings(),
    adminListReportCategories(),
  ]);

  return (
    <AdminLayout>
      <AdminSettingsClient
        settings={settings}
        reportCategories={categories}
      />
    </AdminLayout>
  );
}
