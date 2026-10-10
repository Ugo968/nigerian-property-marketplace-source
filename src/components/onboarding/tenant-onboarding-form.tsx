"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/feedback";
import type { ProfileRow } from "@/types";

interface Props {
  profile: ProfileRow;
}

/**
 * Tenant onboarding form — collects preferences (spec Section 8).
 * All fields except full_name + phone are optional and can be updated later.
 */
export function TenantOnboardingForm({ profile }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Required
  const [fullName, setFullName] = React.useState(profile.full_name ?? "");
  const [phone, setPhone] = React.useState(profile.phone ?? "");

  // Optional preferences
  const [preferredState, setPreferredState] = React.useState("");
  const [preferredCity, setPreferredCity] = React.useState("");
  const [preferredAreas, setPreferredAreas] = React.useState("");
  const [preferredPropertyTypes, setPreferredPropertyTypes] = React.useState("");
  const [bedroomsMin, setBedroomsMin] = React.useState("");
  const [bedroomsMax, setBedroomsMax] = React.useState("");
  const [budgetMin, setBudgetMin] = React.useState("");
  const [budgetMax, setBudgetMax] = React.useState("");
  const [transactionType, setTransactionType] = React.useState<"rent" | "sale" | "shortlet" | "">("");
  const [moveInTimeframe, setMoveInTimeframe] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          preferredState: preferredState.trim() || undefined,
          preferredCity: preferredCity.trim() || undefined,
          preferredAreas: preferredAreas.trim() ? preferredAreas.split(",").map(s => s.trim()).filter(Boolean) : undefined,
          preferredPropertyTypes: preferredPropertyTypes.trim() ? preferredPropertyTypes.split(",").map(s => s.trim()).filter(Boolean) : undefined,
          bedroomsMin: bedroomsMin ? parseInt(bedroomsMin, 10) : undefined,
          bedroomsMax: bedroomsMax ? parseInt(bedroomsMax, 10) : undefined,
          budgetMin: budgetMin ? Math.round(parseFloat(budgetMin) * 100) : undefined,
          budgetMax: budgetMax ? Math.round(parseFloat(budgetMax) * 100) : undefined,
          preferredTransactionType: transactionType || undefined,
          preferredMoveInTimeframe: moveInTimeframe.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Onboarding failed. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Shelty</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You're a few steps away from finding your next home.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Required */}
          <div>
            <Label htmlFor="fullName">Full name *</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone number *</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="0803 123 4567"
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              Preferences (optional — you can update these later)
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="state">Preferred state</Label>
                <Input
                  id="state"
                  value={preferredState}
                  onChange={(e) => setPreferredState(e.target.value)}
                  placeholder="e.g. Abuja"
                />
              </div>
              <div>
                <Label htmlFor="city">Preferred city</Label>
                <Input
                  id="city"
                  value={preferredCity}
                  onChange={(e) => setPreferredCity(e.target.value)}
                  placeholder="e.g. Garki"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="areas">Preferred areas (comma-separated)</Label>
              <Input
                id="areas"
                value={preferredAreas}
                onChange={(e) => setPreferredAreas(e.target.value)}
                placeholder="e.g. Wuse 2, Asokoro, Maitama"
              />
            </div>

            <div>
              <Label htmlFor="types">Preferred property types (comma-separated)</Label>
              <Input
                id="types"
                value={preferredPropertyTypes}
                onChange={(e) => setPreferredPropertyTypes(e.target.value)}
                placeholder="e.g. self_contained, two_bedroom, mini_flat"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bedroomsMin">Min bedrooms</Label>
                <Input
                  id="bedroomsMin"
                  type="number"
                  min="0"
                  max="10"
                  value={bedroomsMin}
                  onChange={(e) => setBedroomsMin(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bedroomsMax">Max bedrooms</Label>
                <Input
                  id="bedroomsMax"
                  type="number"
                  min="0"
                  max="10"
                  value={bedroomsMax}
                  onChange={(e) => setBedroomsMax(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="budgetMin">Min budget (₦)</Label>
                <Input
                  id="budgetMin"
                  type="number"
                  min="0"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="e.g. 500000"
                />
              </div>
              <div>
                <Label htmlFor="budgetMax">Max budget (₦)</Label>
                <Input
                  id="budgetMax"
                  type="number"
                  min="0"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="e.g. 2000000"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="transactionType">Looking to</Label>
              <select
                id="transactionType"
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value as "rent" | "sale" | "shortlet" | "")}
              >
                <option value="">Any</option>
                <option value="rent">Rent</option>
                <option value="sale">Buy</option>
                <option value="shortlet">Short-let</option>
              </select>
            </div>

            <div>
              <Label htmlFor="moveIn">Move-in timeframe (optional)</Label>
              <Input
                id="moveIn"
                value={moveInTimeframe}
                onChange={(e) => setMoveInTimeframe(e.target.value)}
                placeholder="e.g. January 2025"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Spinner className="mr-2" /> : null}
            Complete onboarding
          </Button>
        </form>

        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
          <p>
            <strong>Your 7-day free trial starts now.</strong> Browse up to 10
            property listings. Subscribe for ₦1,500/month to contact landlords
            directly and unlock full access.
          </p>
        </div>
      </div>
    </div>
  );
}
