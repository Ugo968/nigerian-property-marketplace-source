import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListReviews } from "@/lib/admin";
import { AdminReviewsClient } from "@/components/admin/admin-reviews-client";

export const metadata = { title: "Admin · Reviews" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("reviews.moderate");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    status: params.status,
    q: params.q,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const result = await adminListReviews(filters);
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminReviewsClient
        reviews={result.reviews}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
