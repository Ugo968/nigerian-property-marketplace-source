import * as React from "react";
import Link from "next/link";
import { Home } from "lucide-react";

/**
 * Layout for auth pages (login, signup, password reset, verification).
 *
 * Two-column on desktop: left = brand + safety reminder, right = form
 * card. Single column on mobile.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background">
        <div className="container mx-auto h-16 px-4 flex items-center">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-foreground"
          >
            <img src="/logo.png" alt="Shelty" className="h-10 w-auto" />
          </Link>
        </div>
      </header>
      <main className="flex-1 grid lg:grid-cols-2">
        {/* Brand / safety panel */}
        <section className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-12">
          <div className="space-y-4 max-w-md">
            <h1 className="text-3xl font-bold tracking-tight">
              Nigeria&apos;s trusted property marketplace.
            </h1>
            <p className="text-primary-foreground/80 text-base">
              Sign in to manage your properties, applications, conversations,
              and subscriptions.
            </p>
          </div>
          <div className="rounded-lg bg-primary-foreground/10 p-4 text-sm text-primary-foreground/90">
            <p className="font-semibold mb-1">Safety first.</p>
            <p>
              Always inspect a property in person and verify ownership and
              agent identity before making any payment.
            </p>
          </div>
        </section>

        {/* Form panel */}
        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </main>
    </div>
  );
}
