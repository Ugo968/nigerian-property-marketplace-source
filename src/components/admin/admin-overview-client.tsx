"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/feedback";
import type { DashboardMetrics } from "@/lib/admin";

interface Props {
  metrics: DashboardMetrics | null;
  adminRole: "admin" | "super_admin";
}

/**
 * Admin overview client component. Receives the pre-fetched metrics
 * from the server. The metrics object is large but read-only — the
 * client just renders it.
 */
export function AdminOverviewClient({ metrics, adminRole }: Props) {
  if (!metrics) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {adminRole === "super_admin" ? (
        <p className="text-xs text-muted-foreground">
          Signed in as <strong>Super Admin</strong> — full permissions.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Signed in as <strong>Admin</strong> — limited to assigned permissions.
        </p>
      )}

      {/* USERS */}
      <section>
        <SectionHeader title="Users" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total" value={metrics.users.total} />
          <MetricCard label="Active" value={metrics.users.active} tone="emerald" />
          <MetricCard label="Suspended" value={metrics.users.suspended} tone="amber" />
          <MetricCard label="Banned" value={metrics.users.banned} tone="red" />
          <MetricCard label="Today" value={metrics.users.today} />
          <MetricCard label="Last 30d" value={metrics.users.last30d} />
        </div>
        {metrics.users.byRole.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {metrics.users.byRole.map((r) => (
              <span key={r.role} className="px-2 py-0.5 bg-muted rounded capitalize">
                {r.role}: {r.count}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* PROPERTIES */}
      <section>
        <SectionHeader title="Properties" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total" value={metrics.properties.total} />
          <MetricCard label="Available" value={metrics.properties.available} tone="emerald" />
          <MetricCard label="Rented" value={metrics.properties.rented} tone="blue" />
          <MetricCard label="Sold" value={metrics.properties.sold} tone="purple" />
          <MetricCard label="Suspended" value={metrics.properties.suspended} tone="amber" />
          <MetricCard label="Removed" value={metrics.properties.removed} tone="red" />
        </div>
      </section>

      {/* MODERATION QUEUE */}
      <section>
        <SectionHeader title="Moderation queue" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard
            label="Pending verifications"
            value={metrics.verifications.pending + metrics.verifications.underReview}
            href="/admin/verifications"
            tone="amber"
          />
          <MetricCard
            label="Open reports"
            value={metrics.reports.open}
            href="/admin/reports"
            tone="amber"
          />
          <MetricCard
            label="Investigating"
            value={metrics.reports.investigating}
            href="/admin/reports"
            tone="blue"
          />
          <MetricCard
            label="Escalated"
            value={metrics.reports.escalated}
            href="/admin/reports"
            tone="red"
          />
          <MetricCard
            label="Hidden reviews"
            value={metrics.reviews.hidden}
            href="/admin/reviews"
          />
        </div>
      </section>

      {/* PLATFORM REVENUE — only platform payments, never property money */}
      <section>
        <SectionHeader title="Platform revenue (NGN)" />
        <div className="rounded-md border border-info/30 bg-info/5 p-3 mb-2">
          <p className="text-xs text-muted-foreground">
            Platform revenue = subscription + featured promotion + advertising payments only.
            <strong> Does NOT include property rent/sale money</strong> — V1 does not hold
            those funds.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard
            label="Volume (7d)"
            value={`₦${metrics.payments.successfulVolume7dNaira.toLocaleString("en-NG")}`}
          />
          <MetricCard
            label="Volume (30d)"
            value={`₦${metrics.payments.successfulVolume30dNaira.toLocaleString("en-NG")}`}
          />
          <MetricCard
            label="Failed (7d)"
            value={metrics.payments.failedCount7d}
            tone="red"
          />
          <MetricCard
            label="Refunds (30d)"
            value={`₦${metrics.payments.refundedVolume30dNaira.toLocaleString("en-NG")}`}
            tone="blue"
          />
          <MetricCard label="Today" value={metrics.payments.today} />
        </div>
      </section>

      {/* SUBSCRIPTIONS */}
      <section>
        <SectionHeader title="Subscriptions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Active" value={metrics.subscriptions.active} tone="emerald" />
          <MetricCard label="Past due" value={metrics.subscriptions.pastDue} tone="red" />
          <MetricCard label="Cancelled" value={metrics.subscriptions.cancelled} />
          <MetricCard label="Expired" value={metrics.subscriptions.expired} />
        </div>
      </section>

      {/* PROMOTIONS + ADVERTISING */}
      <section>
        <SectionHeader title="Featured & advertising" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Active promotions"
            value={metrics.featured.activePromotions}
            href="/admin/promotions"
            tone="emerald"
          />
          <MetricCard
            label="Scheduled"
            value={metrics.featured.scheduledPromotions}
            href="/admin/promotions"
          />
          <MetricCard
            label="Active campaigns"
            value={metrics.advertising.activeCampaigns}
            href="/admin/advertising"
            tone="emerald"
          />
          <MetricCard
            label="Pending review"
            value={metrics.advertising.pendingReview}
            href="/admin/advertising"
            tone="amber"
          />
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      {title}
    </h2>
  );
}

function MetricCard({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "amber" | "red" | "blue" | "purple";
  href?: string;
}) {
  const toneClasses: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    blue: "border-blue-200 bg-blue-50",
    purple: "border-purple-200 bg-purple-50",
  };
  const cardClass = tone ? toneClasses[tone] : "";
  const content = (
    <Card className={cardClass}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="hover:opacity-80 transition-opacity">
      {content}
    </Link>
  ) : (
    content
  );
}
