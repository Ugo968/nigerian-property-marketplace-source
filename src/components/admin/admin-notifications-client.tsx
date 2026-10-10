"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";
import type { NotificationRow, EmailDeliveryRecordRow } from "@/types";

interface Props {
  notifications: NotificationRow[];
  notificationsTotal: number;
  notificationsPage: number;
  notificationsPageSize: number;
  emailRecords: EmailDeliveryRecordRow[];
  emailTotal: number;
  emailPage: number;
  emailPageSize: number;
  currentFilters: { type?: string; channel?: string };
  currentEmailFilters: { status?: string; template?: string };
}

export function AdminNotificationsClient(props: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/notifications?${params.toString()}`);
  }

  const notifColumns: AdminColumn<NotificationRow>[] = [
    { key: "type", header: "Type", render: (n) => <code className="text-xs">{n.type}</code> },
    { key: "channel", header: "Channel", render: (n) => <span className="text-xs capitalize">{n.channel}</span> },
    { key: "priority", header: "Priority", render: (n) => <span className="text-xs capitalize">{n.priority}</span> },
    { key: "title", header: "Title", render: (n) => <span className="text-xs line-clamp-1">{n.title}</span> },
    {
      key: "read",
      header: "Read?",
      render: (n) => <span className="text-xs">{n.read_at ? "Yes" : "No"}</span>,
    },
    {
      key: "created",
      header: "Created",
      render: (n) => <span className="text-xs">{new Date(n.created_at).toLocaleString("en-NG")}</span>,
    },
  ];

  const emailColumns: AdminColumn<EmailDeliveryRecordRow>[] = [
    { key: "template", header: "Template", render: (r) => <code className="text-xs">{r.template}</code> },
    { key: "email", header: "Recipient", render: (r) => <span className="text-xs">{r.recipient_email}</span> },
    { key: "provider", header: "Provider", render: (r) => <span className="text-xs capitalize">{r.provider}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "attempts",
      header: "Attempts",
      render: (r) => <span className="text-xs">{r.attempt_count}</span>,
    },
    {
      key: "error",
      header: "Error",
      render: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-1">
          {r.error_category ? `${r.error_category}: ${r.error_message ?? ""}` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notifications & email delivery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational visibility into notification + email delivery. Admins do NOT have the
          ability to send arbitrary notifications on behalf of users.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>In-app notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminFilters
            filters={[
              {
                key: "type",
                label: "Type",
                value: currentFiltersFromProps(props.currentFilters).type,
                options: [
                  { value: "account.welcome", label: "Welcome" },
                  { value: "verification.approved", label: "Verification approved" },
                  { value: "verification.rejected", label: "Verification rejected" },
                  { value: "application.accepted", label: "Application accepted" },
                  { value: "application.declined", label: "Application declined" },
                  { value: "payment.successful", label: "Payment successful" },
                  { value: "payment.failed", label: "Payment failed" },
                  { value: "saved_search.match", label: "Saved-search match" },
                  { value: "message.new", label: "New message" },
                ],
                onChange: (v) => updateParam("type", v),
              },
              {
                key: "channel",
                label: "Channel",
                value: currentFiltersFromProps(props.currentFilters).channel,
                options: [
                  { value: "in_app", label: "In-app" },
                  { value: "email", label: "Email" },
                ],
                onChange: (v) => updateParam("channel", v),
              },
            ]}
            onReset={() => router.push("/admin/notifications")}
          />
          <AdminTable
            columns={notifColumns}
            rows={props.notifications}
            rowKey={(n) => n.id}
            mobileCard={(n) => (
              <div className="space-y-1.5">
                <code className="text-xs">{n.type}</code>
                <p className="text-xs text-muted-foreground line-clamp-1">{n.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("en-NG")} · {n.channel}
                </p>
              </div>
            )}
            pagination={{
              page: props.notificationsPage,
              pageSize: props.notificationsPageSize,
              total: props.notificationsTotal,
              onPageChange: (p) => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(p));
                router.push(`/admin/notifications?${params.toString()}`);
              },
            }}
            emptyMessage="No notifications match these filters."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email delivery records</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTable
            columns={emailColumns}
            rows={props.emailRecords}
            rowKey={(r) => r.id}
            mobileCard={(r) => (
              <div className="space-y-1.5">
                <div className="flex justify-between items-start">
                  <code className="text-xs">{r.template}</code>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-muted-foreground">{r.recipient_email}</p>
                {r.error_category ? (
                  <p className="text-xs text-destructive">{r.error_category}</p>
                ) : null}
              </div>
            )}
            emptyMessage="No email delivery records."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function currentFiltersFromProps(f: { type?: string; channel?: string }) {
  return {
    type: f.type ?? "all",
    channel: f.channel ?? "all",
  };
}
