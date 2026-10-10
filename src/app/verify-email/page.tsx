import { AuthLayout } from "@/components/layout/auth-layout";
import { VerifyEmailCard } from "@/components/auth/verify-email-card";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  return (
    <AuthLayout>
      <div className="space-y-6">
        <VerifyEmailCard email={searchParams.email ?? ""} />
      </div>
    </AuthLayout>
  );
}
