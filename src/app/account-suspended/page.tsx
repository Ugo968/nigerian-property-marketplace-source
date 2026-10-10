import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/auth-layout";
import { logoutAction } from "@/lib/auth/actions";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

/**
 * Suspended account page. Per spec Section 14, suspended users can see
 * this page explaining the restriction; they cannot access /dashboard.
 *
 * Banned users are blocked at login (the loginAction returns an error
 * message instead of a redirect). If somehow a banned user reaches
 * this page, the same message works.
 */
export default function AccountSuspendedPage({
  searchParams,
}: {
  searchParams: { reason?: "suspended" | "banned" | "deactivated" };
}) {
  const reason = searchParams.reason ?? "suspended";

  const titles: Record<string, string> = {
    suspended: "Your account is suspended",
    banned: "Your account has been banned",
    deactivated: "Your account is deactivated",
  };

  const descriptions: Record<string, string> = {
    suspended:
      "Your account is currently restricted from marketplace activity. You can still sign out and contact support if you believe this is a mistake.",
    banned:
      "Your account has been banned. You cannot access marketplace features. If you believe this is a mistake, please contact support.",
    deactivated:
      "Your account has been deactivated. Please contact support to reactivate it.",
  };

  return (
    <AuthLayout>
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {titles[reason]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {descriptions[reason]}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await logoutAction();
          }}
        >
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Need help?{" "}
          <Link
            href="/help"
            className="font-medium text-primary hover:underline"
          >
            Contact support
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
