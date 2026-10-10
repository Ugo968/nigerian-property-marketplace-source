import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Home,
  MapPin,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { PublicLayout } from "@/components/layout/public-layout";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { VerificationBadge } from "@/components/verification-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { plansForRole, formatNaira } from "@/lib/subscriptions/plans";
import type { UserRole } from "@/types";

/**
 * Showcase landing page.
 *
 * The first page the user (and the dev preview) sees. Demonstrates the
 * design system, type system, subscription plans, and component library
 * — a real, polished Nigerian real-estate marketplace landing page, not
 * a placeholder.
 */
export default function HomePage() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="border-b bg-linear-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Badge
              variant="outline"
              className="bg-background/60 backdrop-blur"
            >
              <Star className="h-3 w-3 mr-1 text-featured" aria-hidden="true" />
              Shelty
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
              Find your next place.
              <br />
              <span className="text-primary">Trusted, verified, Nigerian.</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              Shelty connects landlords, agents, and real-estate companies
              across Lagos, Abuja, Port Harcourt and beyond. Browse rentals,
              sales, and short-lets from verified professionals.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg">
                <Link href="/properties">
                  Browse properties
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/signup">List your property</Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Verification badges
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4 text-primary" />
                Map view
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4 text-primary" />
                Agent representation
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust indicators */}
      <section className="border-b bg-background">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <TrustCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Verification tiers"
              description="Bronze and Blue verified badges help you trust who you're dealing with."
              badge={<VerificationBadge state="bronze" compact />}
            />
            <TrustCard
              icon={<Building2 className="h-5 w-5" />}
              title="All property types"
              description="Apartments, houses, duplexes, land, commercial spaces, short-lets — all supported."
            />
            <TrustCard
              icon={<Users className="h-5 w-5" />}
              title="Three role types"
              description="Landlords, agents, and companies — pick one and build your professional profile."
            />
            <TrustCard
              icon={<Home className="h-5 w-5" />}
              title="Nigerian-first"
              description="Built for Nigerian locations, phone numbers, payment providers, and rent cycles."
            />
          </div>
        </div>
      </section>

      {/* Safety notice */}
      <section className="container mx-auto px-4 py-8">
        <SafetyNotice />
      </section>

      {/* Pricing — uses the real plans matrix from lib/subscriptions */}
      <section className="bg-muted/30 border-y">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center space-y-3 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground">
              Everyone starts Free. Upgrade for more capacity, better tools,
              and better visibility. Verification is granted by review — not
              by payment.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {(["landlord", "agent", "company"] as UserRole[]).map((role) => (
              <PricingCard key={role} role={role} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="text-center items-center">
            <CardTitle className="text-2xl md:text-3xl">
              Ready to list your property?
            </CardTitle>
            <CardDescription className="max-w-xl">
              Sign up in under a minute. Choose your role, complete your
              profile, and start receiving applications from agents today.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild size="lg">
              <Link href="/signup">
                Create your account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </PublicLayout>
  );
}

function TrustCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {badge}
        </div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function PricingCard({ role }: { role: UserRole }) {
  const plans = plansForRole(role);
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg capitalize">{role}</CardTitle>
        <CardDescription>
          {role === "landlord"
            ? "For property owners"
            : role === "agent"
              ? "For independent realtors"
              : "For real-estate businesses"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.tier}
            className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0"
          >
            <div>
              <p className="font-medium capitalize">{plan.tier}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {plan.tagline}
              </p>
            </div>
            <p className="font-semibold text-right whitespace-nowrap">
              {formatNaira(plan.priceNaira, role === "company" && plan.tier === "premium")}
              <span className="block text-xs font-normal text-muted-foreground">
                /month
              </span>
            </p>
          </div>
        ))}
        <div className="pt-3">
          <Button asChild variant="outline" className="w-full" size="sm">
            <Link href="/signup">
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
