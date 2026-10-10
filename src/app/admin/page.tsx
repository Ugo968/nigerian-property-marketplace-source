import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdmin } from "@/lib/admin";
import { getDashboardMetrics } from "@/lib/admin";
import { AdminOverviewClient } from "@/components/admin/admin-overview-client";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";

export const metadata = {
  ...privateRouteMetadata,
  title: "Admin Overview",
  description: "Platform operational metrics and moderation queue.",
};

export default async function AdminHomePage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/forbidden");
  }

  const metrics = await getDashboardMetrics();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Admin overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform operational metrics and moderation queue.
          </p>
        </header>

        <AdminOverviewClient metrics={metrics} adminRole={admin.role} />
      </div>
    </AdminLayout>
  );
}
