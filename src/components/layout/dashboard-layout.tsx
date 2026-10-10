"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Home,
  LayoutDashboard,
  Bell,
  Bookmark,
  MessageSquare,
  User,
  CreditCard,
  Users,
  Settings,
  Menu,
  Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/properties", label: "Properties", icon: Building2 },
  {
    href: "/dashboard/applications",
    label: "Applications",
    icon: Users,
  },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/transactions", label: "Transactions", icon: Handshake },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/dashboard/profile", label: "Profile", icon: User },
  {
    href: "/dashboard/subscription",
    label: "Subscription",
    icon: CreditCard,
  },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar — visible on all sizes */}
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {/* Mobile menu trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                  aria-expanded={mobileOpen}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="space-y-0 border-b">
                  <SheetTitle className="px-4 py-3">
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2"
                    >
                      <img src="/logo.png" alt="Shelty" className="h-7 w-auto" />
                      Shelty
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <div className="p-3 space-y-6">
                  <div>
                    <NavList
                      items={PRIMARY_NAV}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </div>
                  <div>
                    <p className="px-3 pb-1 text-xs uppercase text-muted-foreground tracking-wider">
                      Account
                    </p>
                    <NavList
                      items={SECONDARY_NAV}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold text-foreground"
            >
              <img src="/logo.png" alt="Shelty" className="h-10 w-auto" />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-background">
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            <div>
              <NavList items={PRIMARY_NAV} />
            </div>
            <div>
              <p className="px-3 pb-1 text-xs uppercase text-muted-foreground tracking-wider">
                Account
              </p>
              <NavList items={SECONDARY_NAV} />
            </div>
          </div>
          <div className="border-t p-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Back to site
            </Link>
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
