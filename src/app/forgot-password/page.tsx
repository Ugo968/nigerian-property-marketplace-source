import { AuthLayout } from "@/components/layout/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Forgot password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </AuthLayout>
  );
}
