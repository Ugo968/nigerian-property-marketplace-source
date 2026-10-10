import { AuthLayout } from "@/components/layout/auth-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set a new password
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </AuthLayout>
  );
}
