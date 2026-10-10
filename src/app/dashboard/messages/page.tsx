import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getInbox } from "@/lib/messaging/fetchers";
import { InboxList } from "@/components/messaging/inbox-list";

/**
 * /dashboard/messages — inbox.
 *
 * Per spec Section 18: shows conversations with property/context, other
 * participant, last message preview, timestamp, unread count, verification.
 */
export default async function DashboardMessagesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/messages");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (profile.account_status === "suspended") {
    redirect("/account-suspended?reason=suspended");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const inbox = await getInbox();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inbox.length === 0
              ? "No conversations yet."
              : `${inbox.filter((i) => i.unreadCount > 0).length} unread of ${inbox.length} conversations`}
          </p>
        </div>

        <div className="rounded-lg border bg-background overflow-hidden">
          <InboxList items={inbox} />
        </div>
      </div>
    </DashboardLayout>
  );
}
