import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getConversation } from "@/lib/messaging/fetchers";
import { ConversationView } from "@/components/messaging/conversation-view";
import { markConversationReadAction } from "@/lib/messaging/actions";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * /dashboard/messages/[conversationId] — conversation detail.
 *
 * Per spec Section 19: header + body + footer (composer).
 * Validates the caller is a participant before rendering.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/login?next=/dashboard/messages/${conversationId}`);
  }

  const conversation = await getConversation(conversationId);

  if (!conversation) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <EmptyState
            title="Conversation not found"
            description="This conversation doesn't exist or you don't have access."
            action={
              <Button asChild>
                <Link href="/dashboard/messages">Back to messages</Link>
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  // Mark as read (spec Section 16) — fire-and-forget
  await markConversationReadAction(conversationId).catch(() => {
    // Best-effort — don't block rendering if mark-read fails
  });

  return (
    <DashboardLayout>
      <ConversationView
        conversationId={conversationId}
        initialData={conversation}
        callerProfileId={profile.id}
      />
    </DashboardLayout>
  );
}
