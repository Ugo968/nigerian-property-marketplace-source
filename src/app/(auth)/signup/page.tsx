import { AuthLayout } from "@/components/layout/auth-layout";
import { SignupForm } from "@/components/auth/signup-form";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

export default function SignupPage() {
  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick your role and start your Shelty journey.
          </p>
        </div>
        <SignupForm />
      </div>
    </AuthLayout>
  );
}
