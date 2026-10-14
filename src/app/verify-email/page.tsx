import { AuthLayout } from "@/components/layout/auth-layout";
import { VerifyEmailCard } from "@/components/auth/verify-email-card";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";

export const metadata = privateRouteMetadata;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.trim() ?? "";

  return (
    <AuthLayout>
      <div className="space-y-6">
        {email ? (
          <VerifyEmailCard email={email} />
        ) : (
          <div className="space-y-3 text-center">
            <h2 className="text-xl font-semibold">
              Email address missing
            </h2>
            <p className="text-sm text-muted-foreground">
              We couldn't find the email address for verification.
              Please return to sign up and try again.
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
