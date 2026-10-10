import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNaira } from "@/lib/subscriptions/plans";
import { MIN_CAMPAIGN_BUDGET_NAIRA } from "@/lib/advertising/config";
import { Building2, Megaphone, ShieldCheck, Check } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertise Your Business",
  description: "Promote your housing-related business to property seekers across Nigeria.",
};

const CATEGORIES = [
  "Carpentry", "Interior Design", "Furniture", "Plumbing", "Electrical",
  "Architecture", "Construction", "Painting", "Solar & Inverter", "Generators",
  "Building Materials", "Cleaning", "Moving & Relocation", "Security",
  "Landscaping", "Home Appliances", "Property Maintenance", "Mortgage & Finance",
];

export default function AdvertisePage() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Hero */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold tracking-tight">
            Advertise your business
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Reach property owners, agents, and seekers across Nigeria.
            Promote your housing-related services to the right audience.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-1.5 text-sm">
            <span className="font-medium">Minimum budget: {formatNaira(MIN_CAMPAIGN_BUDGET_NAIRA)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">No subscription required</span>
          </div>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <Card>
            <CardHeader>
              <Building2 className="h-8 w-8 text-primary mb-2" aria-hidden="true" />
              <CardTitle className="text-base">1. Create business profile</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Register your business, choose a category, and add your contact details.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Megaphone className="h-8 w-8 text-primary mb-2" aria-hidden="true" />
              <CardTitle className="text-base">2. Create campaign</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Choose placement, set budget, select targeting. Pay securely via Paystack or Flutterwave.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="h-8 w-8 text-primary mb-2" aria-hidden="true" />
              <CardTitle className="text-base">3. Get reviewed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Campaigns are reviewed before going live. Payment does not guarantee automatic approval.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Categories */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Business categories</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <span key={cat} className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-sm">
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-success" aria-hidden="true" />
            Separate from marketplace roles
          </div>
          <div>
            <Button asChild size="lg">
              <Link href="/dashboard/advertising">Get started</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Advertising is paid separately. A marketplace subscription does not grant free advertising.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
