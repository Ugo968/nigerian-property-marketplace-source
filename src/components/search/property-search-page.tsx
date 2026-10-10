"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SlidersHorizontal, X, Search, ChevronDown, Map as MapIcon, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchInput,
  Spinner,
  EmptyState,
  ErrorState,
} from "@/components/ui/feedback";
import { SearchResultCard } from "./search-result-card";
import {
  createSavedSearch,
} from "@/lib/search/actions";
import type { SearchParams as SearchFiltersType } from "@/lib/search/params";
import { getSortLabel } from "@/lib/search/ranking";
import type { PropertyTypeRow, AmenityRow } from "@/types";
import type { SearchResult } from "@/lib/search/query-builder";

// Dynamically import the search results map (Leaflet requires window)
const SearchResultsMap = dynamic(
  () => import("@/components/maps/search-results-map").then((m) => m.SearchResultsMap),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center rounded-lg border bg-muted/30" style={{ height: 500 }}>
      <Spinner />
    </div>
  )},
);

/**
 * Property search page — client component.
 *
 * Per spec Sections 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
 * 19, 20, 30, 31, 32, 33:
 *   * URL-based search state (refresh-safe, shareable)
 *   * Server-side filtering + pagination (results passed from server)
 *   * Mobile filter drawer + desktop sidebar
 *   * Active filter chips with "Clear all"
 *   * Sort control
 *   * Result count + empty/error states
 *   * Pagination
 *   * "Save this search" action
 */

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

const SORT_OPTIONS = [
  "recommended",
  "newest",
  "price_low_high",
  "price_high_low",
  "most_relevant",
] as const;

interface PropertySearchPageProps {
  initialResults: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  filters: SearchFiltersType;
  propertyTypes: PropertyTypeRow[];
  amenities: AmenityRow[];
  callerSignedIn: boolean;
}

export function PropertySearchPage({
  initialResults,
  total,
  page,
  pageSize,
  hasMore,
  filters,
  propertyTypes,
  amenities,
  callerSignedIn,
}: PropertySearchPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = React.useState(false);
  const [searchName, setSearchName] = React.useState("");
  const [saveSearchError, setSaveSearchError] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<"list" | "map" | "split">("list");

  // Update a single filter value in the URL
  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Reset to page 1 when filters change
    params.delete("page");
    router.push(`/properties?${params.toString()}`);
  }

  function clearAllFilters() {
    router.push("/properties");
  }

  async function handleSaveSearch() {
    setPending(true);
    setSaveSearchError(null);
    const result = await createSavedSearch({
      name: searchName,
      criteria: filters,
    });
    setPending(false);
    if (!result.ok) {
      setSaveSearchError(result.message ?? "Failed to save search.");
      return;
    }
    setSaveSearchOpen(false);
    setSearchName("");
    router.push("/dashboard/alerts");
  }

  // Active filter chips
  const chips: Array<{ key: string; label: string }> = [];
  if (filters.transaction) {
    chips.push({
      key: "transaction",
      label: filters.transaction === "shortlet" ? "Short-let" : filters.transaction === "rent" ? "Rent" : "Sale",
    });
  }
  if (filters.propertyType) chips.push({ key: "propertyType", label: filters.propertyType });
  if (filters.state) chips.push({ key: "state", label: filters.state });
  if (filters.city) chips.push({ key: "city", label: filters.city });
  if (filters.area) chips.push({ key: "area", label: filters.area });
  if (filters.landmark) chips.push({ key: "landmark", label: filters.landmark });
  if (filters.bedroomsMin) chips.push({ key: "bedrooms", label: `${filters.bedroomsMin}+ beds` });
  if (filters.bathroomsMin) chips.push({ key: "bathrooms", label: `${filters.bathroomsMin}+ baths` });
  if (filters.furnishedStatus) chips.push({ key: "furnished", label: filters.furnishedStatus.replace(/_/g, " ") });
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? `₦${(filters.minPrice / 100 / 1000).toFixed(0)}k` : "₦0";
    const max = filters.maxPrice ? `₦${(filters.maxPrice / 100 / 1000).toFixed(0)}k` : "Any";
    chips.push({ key: "price", label: `${min} – ${max}` });
  }
  if (filters.amenities && filters.amenities.length > 0) {
    chips.push({ key: "amenities", label: `${filters.amenities.length} amenities` });
  }

  const FilterContent = (
    <div className="space-y-5">
      {/* Transaction type */}
      <div className="space-y-2">
        <Label>Transaction type</Label>
        <div className="flex flex-wrap gap-2">
          {(["rent", "sale", "shortlet"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => updateFilter("transaction", filters.transaction === t ? null : t)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                filters.transaction === t
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              {t === "shortlet" ? "Short-let" : t}
            </button>
          ))}
        </div>
      </div>

      {/* Property type */}
      <div className="space-y-1.5">
        <Label htmlFor="propertyType">Property type</Label>
        <Select
          value={filters.propertyType ?? undefined}
          onValueChange={(v) => updateFilter("propertyType", v)}
        >
          <SelectTrigger id="propertyType">
            <SelectValue placeholder="Any type" />
          </SelectTrigger>
          <SelectContent>
            {propertyTypes.map((pt) => (
              <SelectItem key={pt.id} value={pt.slug}>
                {pt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label>Location</Label>
        <Select
          value={filters.state ?? undefined}
          onValueChange={(v) => updateFilter("state", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            {NIGERIAN_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="City (e.g. Abuja)"
          value={filters.city ?? ""}
          onChange={(e) => updateFilter("city", e.target.value || null)}
        />
        <Input
          placeholder="Area (e.g. Garki)"
          value={filters.area ?? ""}
          onChange={(e) => updateFilter("area", e.target.value || null)}
        />
      </div>

      {/* Price range */}
      <div className="space-y-2">
        <Label>Price range (₦)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minPrice ? String(Math.round(filters.minPrice / 100)) : ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) * 100 : null;
              updateFilter("minPrice", v ? String(v) : null);
            }}
          />
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxPrice ? String(Math.round(filters.maxPrice / 100)) : ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) * 100 : null;
              updateFilter("maxPrice", v ? String(v) : null);
            }}
          />
        </div>
        <Select
          value={filters.priceFrequency ?? undefined}
          onValueChange={(v) => updateFilter("priceFrequency", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Frequency (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one_off">Total</SelectItem>
            <SelectItem value="per_month">Per month</SelectItem>
            <SelectItem value="per_year">Per year</SelectItem>
            <SelectItem value="per_week">Per week</SelectItem>
            <SelectItem value="per_day">Per day</SelectItem>
            <SelectItem value="per_night">Per night</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bedrooms + Bathrooms */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Select
            value={filters.bedroomsMin ? String(filters.bedroomsMin) : undefined}
            onValueChange={(v) => updateFilter("bedrooms", v === "0" ? null : v)}
          >
            <SelectTrigger id="bedrooms">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1+</SelectItem>
              <SelectItem value="2">2+</SelectItem>
              <SelectItem value="3">3+</SelectItem>
              <SelectItem value="4">4+</SelectItem>
              <SelectItem value="5">5+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bathrooms">Bathrooms</Label>
          <Select
            value={filters.bathroomsMin ? String(filters.bathroomsMin) : undefined}
            onValueChange={(v) => updateFilter("bathrooms", v === "0" ? null : v)}
          >
            <SelectTrigger id="bathrooms">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1+</SelectItem>
              <SelectItem value="2">2+</SelectItem>
              <SelectItem value="3">3+</SelectItem>
              <SelectItem value="4">4+</SelectItem>
              <SelectItem value="5">5+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Furnished status */}
      <div className="space-y-1.5">
        <Label>Furnished status</Label>
        <div className="flex flex-wrap gap-2">
          {(["furnished", "semi_furnished", "unfurnished", "not_applicable"] as const).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateFilter("furnished", filters.furnishedStatus === s ? null : s)}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                  filters.furnishedStatus === s
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Amenities */}
      <div className="space-y-2">
        <Label>Amenities</Label>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {amenities
            .filter((a) => a.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((amenity) => {
              const selected = filters.amenities?.includes(amenity.slug) ?? false;
              const currentAmenities = filters.amenities ?? [];
              return (
                <label
                  key={amenity.id}
                  htmlFor={`filter-amenity-${amenity.id}`}
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs cursor-pointer ${
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    id={`filter-amenity-${amenity.id}`}
                    checked={selected}
                    onCheckedChange={(v) => {
                      const next = v
                        ? [...currentAmenities, amenity.slug]
                        : currentAmenities.filter((s) => s !== amenity.slug);
                      updateFilter("amenities", next.length > 0 ? next.join(",") : null);
                    }}
                  />
                  {amenity.label}
                </label>
              );
            })}
        </div>
      </div>

      {chips.length > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={clearAllFilters} className="w-full">
          Clear all filters
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <SearchInput
          value={filters.q ?? ""}
          onChange={(v) => updateFilter("q", v || null)}
          onSubmit={(v) => updateFilter("q", v || null)}
          placeholder="Search by location, property type, or keyword..."
          containerClassName="flex-1"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Open filters"
          className="lg:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
        {callerSignedIn ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveSearchOpen(true)}
          >
            Save search
          </Button>
        ) : null}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => updateFilter(chip.key, null)}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Results header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{total}</span>{" "}
          {total === 1 ? "property" : "properties"} found
        </p>
        <div className="flex items-center gap-3">
          {/* View toggle: List / Map / Split */}
          <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`rounded p-1.5 text-sm transition ${
                viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              aria-label="Map view"
              aria-pressed={viewMode === "map"}
              className={`rounded p-1.5 text-sm transition ${
                viewMode === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <MapIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              aria-label="Split view (list and map)"
              aria-pressed={viewMode === "split"}
              className={`hidden sm:inline-flex rounded p-1.5 text-sm transition ${
                viewMode === "split" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="sort" className="text-xs text-muted-foreground">
              Sort:
            </Label>
            <Select
              value={filters.sort ?? "recommended"}
              onValueChange={(v) => updateFilter("sort", v)}
            >
              <SelectTrigger id="sort" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {getSortLabel(opt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main grid + sidebar */}
      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 rounded-lg border bg-background p-4">
            <h2 className="text-sm font-semibold mb-3">Filters</h2>
            {FilterContent}
          </div>
        </aside>

        {/* Results area — adapts to viewMode (list / map / split) */}
        <div className="flex-1 min-w-0">
          {initialResults.length === 0 ? (
            <EmptyState
              title="No properties found"
              description="No properties match your current filters. Try broadening your search."
              action={
                chips.length > 0 ? (
                  <Button onClick={clearAllFilters}>Clear all filters</Button>
                ) : null
              }
            />
          ) : viewMode === "map" ? (
            /* Map-only view */
            <SearchResultsMap results={initialResults} height="70vh" />
          ) : viewMode === "split" ? (
            /* Split view: list + map side by side (desktop only) */
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="grid gap-4 sm:grid-cols-2">
                  {initialResults.map((result) => (
                    <SearchResultCard key={result.id} result={result} />
                  ))}
                </div>
                {/* Pagination */}
                {total > pageSize ? (
                  <div className="flex items-center justify-between pt-6">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {Math.ceil(total / pageSize)}
                    </p>
                    <div className="flex gap-2">
                      {page > 1 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateFilter("page", String(page - 1))}
                        >
                          Previous
                        </Button>
                      ) : null}
                      {hasMore ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateFilter("page", String(page + 1))}
                        >
                          Next
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hidden sm:block w-[45%] shrink-0 sticky top-24 self-start">
                <SearchResultsMap results={initialResults} height="70vh" />
              </div>
            </div>
          ) : (
            /* List view (default) */
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {initialResults.map((result) => (
                  <SearchResultCard key={result.id} result={result} />
                ))}
              </div>

              {/* Pagination */}
              {total > pageSize ? (
                <div className="flex items-center justify-between pt-6">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {Math.ceil(total / pageSize)}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateFilter("page", String(page - 1))}
                      >
                        Previous
                      </Button>
                    ) : null}
                    {hasMore ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateFilter("page", String(page + 1))}
                      >
                        Next
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="p-4">{FilterContent}</div>
        </SheetContent>
      </Sheet>

      {/* Save search dialog */}
      {saveSearchOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="rounded-lg border bg-background p-6 max-w-md w-full mx-4 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Save this search</h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll let you know when new properties match these criteria.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="searchName">Search name</Label>
              <Input
                id="searchName"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g. 3-bedroom apartments in Abuja"
                maxLength={80}
              />
            </div>
            {saveSearchError ? (
              <p className="text-sm text-destructive">{saveSearchError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSaveSearchOpen(false);
                  setSearchName("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSearch}
                disabled={pending || searchName.trim().length < 3}
              >
                {pending ? <Spinner className="mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
