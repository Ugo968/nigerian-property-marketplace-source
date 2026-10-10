import { AuthLayout } from "@/components/layout/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

export default function LoginPage() {
  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your properties, applications, and messages.
          </p>
        </div>
        <LoginForm />
      </div>
    </AuthLayout>
  );
}
