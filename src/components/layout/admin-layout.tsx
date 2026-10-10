import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldAlert,
  Users,
  Building2,
  BadgeCheck,
  Star,
  Flag,
  CreditCard,
  Repeat,
  Sparkles,
  Megaphone,
  Bell,
  ScrollText,
  Settings,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Admin layout shell — separate from the marketplace (dashboard) layout.
 *
 * The actual RBAC check happens in the (admin) route group's server
 * components (requireAdmin() / requireAdminPermission()). This layout
 * is purely the visual shell so admin pages share a consistent
 * sidebar + top bar.
 *
 * The sidebar lists all 14 admin sections from spec Section 4.
 * The mobile nav uses a Sheet for the same links.
 */

interface AdminNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: ShieldAlert },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/properties", label: "Properties", icon: Building2 },
  { href: "/admin/transactions", label: "Transactions", icon: Users },
  { href: "/admin/verifications", label: "Verifications", icon: BadgeCheck },
  { href: "/admin/applications", label: "Applications", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/admin/promotions", label: "Promotions", icon: Sparkles },
  { href: "/admin/advertising", label: "Advertising", icon: Megaphone },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminNavLink({ item, onNavigate }: { item: AdminNavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href ||
    (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
        isActive
          ? "bg-destructive/10 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {/* Mobile menu trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open admin navigation"
                  aria-expanded={mobileOpen}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="space-y-0 border-b">
                  <SheetTitle className="px-4 py-3">
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive text-destructive-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      Shelty Admin
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <nav className="p-3 space-y-1">
                  {ADMIN_NAV.map((item) => (
                    <AdminNavLink
                      key={item.href}
                      item={item}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  ))}
                </nav>
              </SheetContent>
            </Sheet>

            <Link
              href="/admin"
              className="flex items-center gap-2 font-semibold text-foreground"
            >
              <img src="/logo.png" alt="Shelty Admin" className="h-10 w-auto" />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Exit admin</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-background p-3">
          <nav className="space-y-1">
            {ADMIN_NAV.map((item) => (
              <AdminNavLink key={item.href} item={item} />
            ))}
          </nav>
          <div className="mt-auto pt-3 border-t">
            <p className="px-3 text-[10px] text-muted-foreground">
              Admin actions are audit-logged.
            </p>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
