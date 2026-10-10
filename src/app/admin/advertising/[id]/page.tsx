import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListModerationHistory } from "@/lib/admin";
import { createAdminClient } from "@/lib/db/supabase";
import { AdminCampaignDetailClient } from "@/components/admin/admin-campaign-detail-client";

export const metadata = { title: "Admin · Campaign detail" };

export default async function AdminCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdminPermission("advertising.manage");
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  const { data: campRow } = await admin
    .from("advertising_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!campRow) notFound();

  const camp = campRow as { business_id: string };

  const { data: businessRow } = await admin
    .from("advertising_businesses")
    .select("id, business_name, owner_user_id")
    .eq("id", camp.business_id)
    .maybeSingle();

  const { data: creativeRow } = await admin
    .from("advertising_creatives")
    .select("id, creative_type, headline, body_text, cta_text, target_url")
    .eq("id", (campRow as { creative_id?: string }).creative_id ?? "")
    .maybeSingle();

  const moderationHistory = await adminListModerationHistory("advertising_campaign", id);

  return (
    <AdminLayout>
      <AdminCampaignDetailClient
        campaign={campRow as never}
        business={businessRow as never}
        creative={creativeRow as never}
        moderationHistory={moderationHistory}
      />
    </AdminLayout>
  );
}
