"use client";

import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { NotificationsList } from "./notifications-list";
import { NotificationPreferences } from "./notification-preferences";

interface Props {
  initialTab: "all" | "preferences";
}

/**
 * Client wrapper for the /dashboard/notifications page — owns the tab
 * state and reads the initial tab from the URL so deep-linking to
 * ?tab=preferences works.
 */
export function NotificationsPageClient({ initialTab }: Props) {
  const [tab, setTab] = React.useState<"all" | "preferences" | "unread">(initialTab);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your activity feed and notification preferences.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <NotificationsList filter="all" />
        </TabsContent>
        <TabsContent value="unread" className="mt-4">
          <NotificationsList filter="unread" />
        </TabsContent>
        <TabsContent value="preferences" className="mt-4">
          <NotificationPreferences />
        </TabsContent>
      </Tabs>
    </div>
  );
}
