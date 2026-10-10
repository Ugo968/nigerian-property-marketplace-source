"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Star, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner, ErrorState, EmptyState } from "@/components/ui/feedback";
import { OnboardingShell, OnboardingActions } from "@/components/onboarding/onboarding-shell";

// Dynamically import LocationPicker (Leaflet requires window)
const LocationPicker = dynamic(
  () => import("@/components/maps/location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-6">
        <Spinner />
      </div>
    ),
  },
);
import {
  createPropertyDraft,
  updatePropertyStep,
  publishProperty,
} from "@/lib/properties/actions";
import {
  uploadPropertyMedia,
  deletePropertyMedia,
  setFeaturedPropertyMedia,
} from "@/lib/properties/media-actions";
import {
  getRequiredFieldsForTransaction,
  shouldShowFurnishedStatus,
} from "@/lib/properties/validation";
import { checkTitleQuality } from "@/lib/properties/anti-spam";
import { formatNaira } from "@/lib/subscriptions/plans";
import { VerificationBadge } from "@/components/verification-badge";
import type { PropertyTypeRow, AmenityRow } from "@/types";

const STEPS = [
  "Type",
  "Transaction",
  "Details",
  "Pricing",
  "Location",
  "Features",
  "Photos",
  "Description",
  "Preview",
  "Publish",
];

interface PropertyWizardProps {
  propertyTypes: PropertyTypeRow[];
  amenities: AmenityRow[];
  listedBy: {
    fullName: string;
    role: "landlord" | "agent" | "company";
    verificationState: "unverified" | "pending" | "bronze" | "blue" | "rejected" | "suspended" | "revoked";
  };
}

/**
 * Property creation wizard — multi-step form.
 * Step 1: Property type
 * Step 2: Transaction type
 * Step 3: Basic details (title, beds, baths, etc.)
 * Step 4: Pricing
 * Step 5: Location
 * Step 6: Features & amenities
 * Step 7: Photos & videos
 * Step 8: Description
 * Step 9: Preview
 * Step 10: Publish
 */
export function PropertyWizard({ propertyTypes, amenities, listedBy }: PropertyWizardProps) {
  const router = useRouter();

  // Draft state — initialized when user picks type + transaction
  const [propertyId, setPropertyId] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);

  // Step 1+2 selections
  const [propertyTypeId, setPropertyTypeId] = React.useState<string | null>(null);
  const [transactionType, setTransactionType] = React.useState<"rent" | "sale" | "shortlet" | null>(null);

  // Step 3: Basic details
  const [title, setTitle] = React.useState("");
  const [bedrooms, setBedrooms] = React.useState(0);
  const [bathrooms, setBathrooms] = React.useState(0);
  const [toilets, setToilets] = React.useState(0);
  const [yearBuilt, setYearBuilt] = React.useState<number | "">("");
  const [parkingSpaces, setParkingSpaces] = React.useState(0);
  const [floors, setFloors] = React.useState<number | "">("");

  // Step 4: Pricing
  const [price, setPrice] = React.useState<number | "">("");
  const [currency, setCurrency] = React.useState<"NGN" | "USD">("NGN");
  const [priceFrequency, setPriceFrequency] = React.useState<string | null>(null);

  // Step 5: Location
  const [country, setCountry] = React.useState("Nigeria");
  const [state, setState] = React.useState("");
  const [city, setCity] = React.useState("");
  const [area, setArea] = React.useState("");
  const [landmark, setLandmark] = React.useState("");
  const [addressLine, setAddressLine] = React.useState("");
  const [addressLga, setAddressLga] = React.useState("");
  const [privateLat, setPrivateLat] = React.useState<number | "">("");
  const [privateLng, setPrivateLng] = React.useState<number | "">("");

  // Step 6: Features
  const [furnishedStatus, setFurnishedStatus] = React.useState<
    "furnished" | "semi_furnished" | "unfurnished" | "not_applicable"
  >("not_applicable");
  const [sizeValue, setSizeValue] = React.useState<number | "">("");
  const [sizeUnit, setSizeUnit] = React.useState<"sqm" | "sqft" | "acre" | "hectare" | "plot" | "">("");
  const [selectedAmenities, setSelectedAmenities] = React.useState<Set<string>>(new Set());

  // Step 7: Photos
  const [uploadedMedia, setUploadedMedia] = React.useState<
    Array<{ id: string; url: string; isFeatured: boolean; fileName: string }>
  >([]);

  // Step 8: Description
  const [description, setDescription] = React.useState("");

  // UI state
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [topSuccess, setTopSuccess] = React.useState<string | null>(null);
  const [stepError, setStepError] = React.useState<string | null>(null);

  // -------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------
  function nextStep() {
    setStepError(null);
    setTopError(null);

    // Step-specific validation before advancing
    if (step === 0 && !propertyTypeId) {
      setStepError("Select a property type to continue");
      return;
    }
    if (step === 1 && !transactionType) {
      setStepError("Select a transaction type to continue");
      return;
    }
    if (step === 2 && title.trim().length < 10) {
      setStepError("Title must be at least 10 characters");
      return;
    }
    if (step === 3 && (price === "" || price <= 0)) {
      setStepError("Enter a valid price");
      return;
    }
    if (step === 3 && transactionType !== "sale" && !priceFrequency) {
      setStepError("Select a price frequency for rent/short-let");
      return;
    }
    if (step === 4 && (!state.trim() || !city.trim())) {
      setStepError("State and city are required");
      return;
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  }

  function prevStep() {
    setStepError(null);
    if (step > 0) setStep(step - 1);
  }

  // -------------------------------------------------------------------
  // Create draft on step 2 → step 3 transition
  // -------------------------------------------------------------------
  async function handleStartDraft() {
    if (!propertyTypeId || !transactionType) return;
    setPending(true);
    const result = await createPropertyDraft({ propertyTypeId, transactionType });
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Failed to create draft");
      return;
    }
    if (result.propertyId) {
      setPropertyId(result.propertyId);
      setStep(2); // jump to step 3 (basic details)
    }
  }

  // -------------------------------------------------------------------
  // Save step data to server
  // -------------------------------------------------------------------
  async function saveStep(stepName: "basic_details" | "pricing" | "location" | "features" | "description") {
    if (!propertyId) return;
    setPending(true);
    setTopError(null);

    let data: Record<string, unknown> = {};
    switch (stepName) {
      case "basic_details":
        data = {
          title,
          bedrooms,
          bathrooms,
          toilets,
          yearBuilt: yearBuilt === "" ? undefined : Number(yearBuilt),
          parkingSpaces,
          floors: floors === "" ? undefined : Number(floors),
        };
        break;
      case "pricing":
        data = {
          price: price === "" ? 0 : Number(price),
          currency,
          priceFrequency,
        };
        break;
      case "location":
        // Compute public coords (rounded to ~100m) from private coords
        const pubLat = privateLat === "" ? undefined : Math.round(Number(privateLat) * 1000) / 1000;
        const pubLng = privateLng === "" ? undefined : Math.round(Number(privateLng) * 1000) / 1000;
        data = {
          country,
          state,
          city,
          area,
          landmark,
          addressLine,
          addressLga,
          privateLat: privateLat === "" ? undefined : Number(privateLat),
          privateLng: privateLng === "" ? undefined : Number(privateLng),
          publicLat: pubLat,
          publicLng: pubLng,
        };
        break;
      case "features":
        data = {
          furnishedStatus,
          sizeValue: sizeValue === "" ? undefined : Number(sizeValue),
          sizeUnit: sizeUnit || undefined,
          amenityIds: Array.from(selectedAmenities),
        };
        break;
      case "description":
        data = { description };
        break;
    }

    const result = await updatePropertyStep({
      propertyId,
      step: stepName,
      data,
    });
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Failed to save");
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------
  // Handle Next button — save step + advance
  // -------------------------------------------------------------------
  async function handleNext() {
    if (step === 1) {
      // Step 2 → 3: create the draft
      await handleStartDraft();
      return;
    }

    let savedOk = true;
    if (step === 2) savedOk = await saveStep("basic_details");
    else if (step === 3) savedOk = await saveStep("pricing");
    else if (step === 4) savedOk = await saveStep("location");
    else if (step === 5) savedOk = await saveStep("features");
    else if (step === 7) savedOk = await saveStep("description");

    if (!savedOk) return;
    nextStep();
  }

  // -------------------------------------------------------------------
  // Photo upload
  // -------------------------------------------------------------------
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!propertyId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setTopError(null);

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const first16 = bytes.slice(0, 16);
    const firstBytesBase64 = btoa(String.fromCharCode(...first16));
    const fileBufferBase64 = btoa(String.fromCharCode(...bytes));

    const result = await uploadPropertyMedia({
      propertyId,
      fileName: file.name,
      clientMimeType: file.type,
      fileSize: file.size,
      firstBytesBase64,
      fileBufferBase64,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
    });
    setUploading(false);
    e.target.value = "";

    if (!result.ok) {
      setTopError(result.message ?? "Upload failed");
      return;
    }
    if (result.mediaId && result.mediaUrl) {
      setUploadedMedia((prev) => [
        ...prev,
        {
          id: result.mediaId!,
          url: result.mediaUrl!,
          isFeatured: prev.length === 0,
          fileName: file.name,
        },
      ]);
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    if (!propertyId) return;
    setUploadedMedia((prev) => prev.filter((m) => m.id !== mediaId));
    await deletePropertyMedia({ propertyId, mediaId });
  }

  async function handleSetFeatured(mediaId: string) {
    if (!propertyId) return;
    setUploadedMedia((prev) =>
      prev.map((m) => ({ ...m, isFeatured: m.id === mediaId })),
    );
    await setFeaturedPropertyMedia({ propertyId, mediaId });
  }

  // -------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------
  async function handlePublish() {
    if (!propertyId) return;
    setPending(true);
    setTopError(null);
    const result = await publishProperty(propertyId);
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Publish failed");
      return;
    }
    if (result.redirectTo) {
      router.push(result.redirectTo);
    }
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (step < 2 && !propertyId) {
    return (
      <OnboardingShell
        role={listedBy.role}
        roleLabel="Property"
        steps={STEPS}
        currentStep={step}
      >
        <div className="space-y-5">
          {topError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{topError}</span>
            </div>
          ) : null}

          {step === 0 ? (
            <PropertyTypeStep
              propertyTypes={propertyTypes}
              selected={propertyTypeId}
              onSelect={setPropertyTypeId}
            />
          ) : null}

          {step === 1 ? (
            <TransactionTypeStep
              selected={transactionType}
              onSelect={setTransactionType}
            />
          ) : null}

          {stepError ? (
            <p className="text-sm text-destructive">{stepError}</p>
          ) : null}

          <OnboardingActions
            hideBack={step === 0}
            onBack={prevStep}
            onNext={handleNext}
            nextLabel={pending ? "Creating draft..." : "Continue"}
            pending={pending}
          />
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      role={listedBy.role}
      roleLabel="Property"
      steps={STEPS}
      currentStep={step}
    >
      <div className="space-y-5">
        {topError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{topError}</span>
          </div>
        ) : null}

        {topSuccess ? (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            {topSuccess}
          </div>
        ) : null}

        {step === 2 ? (
          <BasicDetailsStep
            title={title}
            setTitle={setTitle}
            bedrooms={bedrooms}
            setBedrooms={setBedrooms}
            bathrooms={bathrooms}
            setBathrooms={setBathrooms}
            toilets={toilets}
            setToilets={setToilets}
            yearBuilt={yearBuilt}
            setYearBuilt={setYearBuilt}
            parkingSpaces={parkingSpaces}
            setParkingSpaces={setParkingSpaces}
            floors={floors}
            setFloors={setFloors}
          />
        ) : null}

        {step === 3 ? (
          <PricingStep
            price={price}
            setPrice={setPrice}
            currency={currency}
            setCurrency={setCurrency}
            priceFrequency={priceFrequency}
            setPriceFrequency={setPriceFrequency}
            transactionType={transactionType!}
          />
        ) : null}

        {step === 4 ? (
          <LocationStep
            country={country}
            setCountry={setCountry}
            state={state}
            setState={setState}
            city={city}
            setCity={setCity}
            area={area}
            setArea={setArea}
            landmark={landmark}
            setLandmark={setLandmark}
            addressLine={addressLine}
            setAddressLine={setAddressLine}
            addressLga={addressLga}
            setAddressLga={setAddressLga}
            privateLat={privateLat}
            setPrivateLat={setPrivateLat}
            privateLng={privateLng}
            setPrivateLng={setPrivateLng}
          />
        ) : null}

        {step === 5 ? (
          <FeaturesStep
            propertyTypeCategory={getPropertyCategory(propertyTypes, propertyTypeId)}
            furnishedStatus={furnishedStatus}
            setFurnishedStatus={setFurnishedStatus}
            sizeValue={sizeValue}
            setSizeValue={setSizeValue}
            sizeUnit={sizeUnit}
            setSizeUnit={setSizeUnit}
            amenities={amenities}
            selectedAmenities={selectedAmenities}
            setSelectedAmenities={setSelectedAmenities}
          />
        ) : null}

        {step === 6 ? (
          <PhotosStep
            uploadedMedia={uploadedMedia}
            uploading={uploading}
            onUpload={handleFileUpload}
            onDelete={handleDeleteMedia}
            onSetFeatured={handleSetFeatured}
          />
        ) : null}

        {step === 7 ? (
          <DescriptionStep
            description={description}
            setDescription={setDescription}
          />
        ) : null}

        {step === 8 ? (
          <PreviewStep
            title={title}
            transactionType={transactionType!}
            price={price === "" ? 0 : Number(price)}
            priceFrequency={priceFrequency}
            currency={currency}
            state={state}
            city={city}
            area={area}
            landmark={landmark}
            description={description}
            uploadedMedia={uploadedMedia}
            selectedAmenities={selectedAmenities}
            amenities={amenities}
            listedBy={listedBy}
          />
        ) : null}

        {step === 9 ? (
          <PublishStep
            title={title}
            propertyId={propertyId}
            onPublish={handlePublish}
            pending={pending}
          />
        ) : null}

        {stepError ? (
          <p className="text-sm text-destructive">{stepError}</p>
        ) : null}

        {step < 9 ? (
          <OnboardingActions
            hideBack={step === 0}
            onBack={prevStep}
            onNext={handleNext}
            nextLabel={pending ? "Saving..." : step === 8 ? "Review" : "Continue"}
            pending={pending}
          />
        ) : null}
      </div>
    </OnboardingShell>
  );
}

function getPropertyCategory(
  types: PropertyTypeRow[],
  selectedId: string | null,
): string {
  if (!selectedId) return "residential";
  return types.find((t) => t.id === selectedId)?.category ?? "residential";
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function PropertyTypeStep({
  propertyTypes,
  selected,
  onSelect,
}: {
  propertyTypes: PropertyTypeRow[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const grouped = React.useMemo(() => {
    const groups: Record<string, PropertyTypeRow[]> = {};
    for (const pt of propertyTypes) {
      if (!pt.is_active) continue;
      if (!groups[pt.category]) groups[pt.category] = [];
      groups[pt.category].push(pt);
    }
    return groups;
  }, [propertyTypes]);

  const categoryLabels: Record<string, string> = {
    residential: "Residential",
    commercial: "Commercial",
    industrial: "Industrial",
    land: "Land",
    mixed_use: "Mixed-Use",
    other: "Other",
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">What kind of property?</h2>
        <p className="text-sm text-muted-foreground">
          Pick the category that best matches your listing.
        </p>
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {categoryLabels[category] ?? category}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {items.map((pt) => (
              <button
                key={pt.id}
                type="button"
                onClick={() => onSelect(pt.id)}
                className={`rounded-md border p-3 text-left text-sm transition ${
                  selected === pt.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <span className="font-medium text-foreground">{pt.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionTypeStep({
  selected,
  onSelect,
}: {
  selected: "rent" | "sale" | "shortlet" | null;
  onSelect: (t: "rent" | "sale" | "shortlet") => void;
}) {
  const options: Array<{
    value: "rent" | "sale" | "shortlet";
    label: string;
    description: string;
  }> = [
    { value: "rent", label: "For Rent", description: "Tenant pays rent periodically (monthly / yearly)." },
    { value: "sale", label: "For Sale", description: "Property is for sale — one-time payment." },
    { value: "shortlet", label: "Short-let", description: "Daily / nightly / weekly stays." },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">What kind of transaction?</h2>
        <p className="text-sm text-muted-foreground">
          Determines how pricing is displayed.
        </p>
      </div>
      <div className="space-y-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={`w-full rounded-lg border p-4 text-left transition ${
              selected === opt.value
                ? "border-primary bg-primary/5 ring-2 ring-primary"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <p className="font-medium text-foreground">{opt.label}</p>
            <p className="text-sm text-muted-foreground mt-1">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function BasicDetailsStep(props: {
  title: string;
  setTitle: (v: string) => void;
  bedrooms: number;
  setBedrooms: (v: number) => void;
  bathrooms: number;
  setBathrooms: (v: number) => void;
  toilets: number;
  setToilets: (v: number) => void;
  yearBuilt: number | "";
  setYearBuilt: (v: number | "") => void;
  parkingSpaces: number;
  setParkingSpaces: (v: number) => void;
  floors: number | "";
  setFloors: (v: number | "") => void;
}) {
  const titleQuality = props.title.length > 0 ? checkTitleQuality(props.title) : null;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Basic details</h2>
        <p className="text-sm text-muted-foreground">
          A clear, descriptive title helps buyers find your listing.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          placeholder="e.g. 4-Bedroom Detached Duplex with BQ in Gwarinpa"
          maxLength={200}
        />
        {titleQuality && titleQuality.quality !== "clean" ? (
          <p className="text-xs text-warning">
            ⚠ {titleQuality.reasons.join(". ")}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Input
            id="bedrooms"
            type="number"
            min={0}
            max={50}
            value={props.bedrooms}
            onChange={(e) => props.setBedrooms(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bathrooms">Bathrooms</Label>
          <Input
            id="bathrooms"
            type="number"
            min={0}
            max={50}
            value={props.bathrooms}
            onChange={(e) => props.setBathrooms(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="toilets">Toilets</Label>
          <Input
            id="toilets"
            type="number"
            min={0}
            max={50}
            value={props.toilets}
            onChange={(e) => props.setToilets(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="yearBuilt">Year built (optional)</Label>
          <Input
            id="yearBuilt"
            type="number"
            min={1800}
            max={new Date().getFullYear() + 1}
            value={props.yearBuilt}
            onChange={(e) =>
              props.setYearBuilt(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="parkingSpaces">Parking spaces</Label>
          <Input
            id="parkingSpaces"
            type="number"
            min={0}
            max={1000}
            value={props.parkingSpaces}
            onChange={(e) => props.setParkingSpaces(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="floors">Floors (optional)</Label>
          <Input
            id="floors"
            type="number"
            min={0}
            max={200}
            value={props.floors}
            onChange={(e) =>
              props.setFloors(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
      </div>
    </div>
  );
}

function PricingStep(props: {
  price: number | "";
  setPrice: (v: number | "") => void;
  currency: "NGN" | "USD";
  setCurrency: (v: "NGN" | "USD") => void;
  priceFrequency: string | null;
  setPriceFrequency: (v: string | null) => void;
  transactionType: "rent" | "sale" | "shortlet";
}) {
  const { priceFrequencyOptions } = getRequiredFieldsForTransaction(
    props.transactionType,
  );
  const priceInNaira = props.price === "" ? 0 : Number(props.price);
  const displayPrice = priceInNaira > 0 ? formatNaira(priceInNaira) : "—";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Pricing</h2>
        <p className="text-sm text-muted-foreground">
          {props.transactionType === "sale"
            ? "Set the total sale price."
            : "Set the price + frequency."}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="price">
            Price <span className="text-destructive">*</span>
          </Label>
          <Input
            id="price"
            type="number"
            min={0}
            step={1000}
            value={props.price}
            onChange={(e) =>
              props.setPrice(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="e.g. 3500000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            value={props.currency}
            onChange={(e) => props.setCurrency(e.target.value as "NGN" | "USD")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="NGN">₦ NGN (Naira)</option>
            <option value="USD">$ USD (Dollar)</option>
          </select>
        </div>
      </div>
      {props.transactionType !== "sale" ? (
        <div className="space-y-1.5">
          <Label htmlFor="frequency">
            Price frequency <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {priceFrequencyOptions.map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => props.setPriceFrequency(freq)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  props.priceFrequency === freq
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {freq.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Display: <span className="font-medium text-foreground">{displayPrice}</span>
        {props.priceFrequency ? (
          <span> / {props.priceFrequency.replace(/_/g, " ")}</span>
        ) : null}
      </p>
    </div>
  );
}

function LocationStep(props: {
  country: string;
  setCountry: (v: string) => void;
  state: string;
  setState: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  area: string;
  setArea: (v: string) => void;
  landmark: string;
  setLandmark: (v: string) => void;
  addressLine: string;
  setAddressLine: (v: string) => void;
  addressLga: string;
  setAddressLga: (v: string) => void;
  privateLat: number | "";
  setPrivateLat: (v: number | "") => void;
  privateLng: number | "";
  setPrivateLng: (v: number | "") => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Location</h2>
        <p className="text-sm text-muted-foreground">
          Public location (area, landmark) is shown to everyone. Exact address
          is kept private until you accept an inquiry.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            value={props.country}
            onChange={(e) => props.setCountry(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">
            State <span className="text-destructive">*</span>
          </Label>
          <Input
            id="state"
            value={props.state}
            onChange={(e) => props.setState(e.target.value)}
            placeholder="e.g. Lagos"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="city">
            City <span className="text-destructive">*</span>
          </Label>
          <Input
            id="city"
            value={props.city}
            onChange={(e) => props.setCity(e.target.value)}
            placeholder="e.g. Lekki"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="area">Area / neighbourhood</Label>
          <Input
            id="area"
            value={props.area}
            onChange={(e) => props.setArea(e.target.value)}
            placeholder="e.g. Lekki Phase 1"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="landmark">Landmark</Label>
        <Input
          id="landmark"
          value={props.landmark}
          onChange={(e) => props.setLandmark(e.target.value)}
          placeholder="e.g. Near Shoprite Lekki"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="addressLine">Private exact address (not shown publicly)</Label>
        <Input
          id="addressLine"
          value={props.addressLine}
          onChange={(e) => props.setAddressLine(e.target.value)}
          placeholder="e.g. 12 Admiralty Way, Lekki Phase 1"
        />
      </div>

      {/* Map location picker — primary method */}
      <div className="space-y-2 pt-2 border-t">
        <Label>Set location on map</Label>
        <p className="text-xs text-muted-foreground">
          Search for a location, then drag the marker to the exact spot.
          The public map will show an approximate location.
        </p>
        <LocationPicker
          initialPosition={
            props.privateLat !== "" && props.privateLng !== ""
              ? { lat: Number(props.privateLat), lng: Number(props.privateLng) }
              : null
          }
          onLocationSelect={(loc) => {
            props.setPrivateLat(loc.coordinates.lat);
            props.setPrivateLng(loc.coordinates.lng);
          }}
          height={300}
        />
      </div>

      {/* Manual coordinates — fallback for advanced users */}
      <details className="pt-2">
        <summary className="text-xs text-primary hover:underline cursor-pointer">
          Enter coordinates manually
        </summary>
        <div className="grid sm:grid-cols-2 gap-3 pt-2">
        <div className="space-y-1.5">
          <Label htmlFor="privateLat">Latitude (-90 to 90)</Label>
          <Input
            id="privateLat"
            type="number"
            step="0.000001"
            min={-90}
            max={90}
            value={props.privateLat}
            onChange={(e) =>
              props.setPrivateLat(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="e.g. 6.451234"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="privateLng">Longitude (-180 to 180)</Label>
          <Input
            id="privateLng"
            type="number"
            step="0.000001"
            min={-180}
            max={180}
            value={props.privateLng}
            onChange={(e) =>
              props.setPrivateLng(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="e.g. 3.451234"
          />
        </div>
      </div>
      </details>
      <p className="text-xs text-muted-foreground">
        Coordinates are stored privately; a rounded public coordinate (~100m) is
        computed automatically for the public map.
      </p>
    </div>
  );
}

function FeaturesStep(props: {
  propertyTypeCategory: string;
  furnishedStatus: "furnished" | "semi_furnished" | "unfurnished" | "not_applicable";
  setFurnishedStatus: (v: "furnished" | "semi_furnished" | "unfurnished" | "not_applicable") => void;
  sizeValue: number | "";
  setSizeValue: (v: number | "") => void;
  sizeUnit: "sqm" | "sqft" | "acre" | "hectare" | "plot" | "";
  setSizeUnit: (v: "sqm" | "sqft" | "acre" | "hectare" | "plot" | "") => void;
  amenities: AmenityRow[];
  selectedAmenities: Set<string>;
  setSelectedAmenities: (v: Set<string>) => void;
}) {
  const showFurnished = shouldShowFurnishedStatus(props.propertyTypeCategory);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Features & amenities</h2>
        <p className="text-sm text-muted-foreground">
          Pick the amenities this property offers.
        </p>
      </div>
      {showFurnished ? (
        <div className="space-y-1.5">
          <Label>Furnished status</Label>
          <div className="flex flex-wrap gap-2">
            {(["furnished", "semi_furnished", "unfurnished", "not_applicable"] as const).map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => props.setFurnishedStatus(status)}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                    props.furnishedStatus === status
                      ? "border-primary bg-primary/5 ring-2 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {status.replace(/_/g, " ")}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sizeValue">Size (optional)</Label>
          <Input
            id="sizeValue"
            type="number"
            min={0}
            step="0.01"
            value={props.sizeValue}
            onChange={(e) =>
              props.setSizeValue(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sizeUnit">Size unit</Label>
          <select
            id="sizeUnit"
            value={props.sizeUnit || ""}
            onChange={(e) =>
              props.setSizeUnit(e.target.value as never)
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select unit...</option>
            <option value="sqm">Square metres (sqm)</option>
            <option value="sqft">Square feet (sqft)</option>
            <option value="acre">Acres</option>
            <option value="hectare">Hectares</option>
            <option value="plot">Plots</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Amenities</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {props.amenities
            .filter((a) => a.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((amenity) => {
              const checked = props.selectedAmenities.has(amenity.id);
              return (
                <label
                  key={amenity.id}
                  htmlFor={`amenity-${amenity.id}`}
                  className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer transition ${
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    id={`amenity-${amenity.id}`}
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(props.selectedAmenities);
                      if (v) next.add(amenity.id);
                      else next.delete(amenity.id);
                      props.setSelectedAmenities(next);
                    }}
                  />
                  {amenity.label}
                </label>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function PhotosStep(props: {
  uploadedMedia: Array<{ id: string; url: string; isFeatured: boolean; fileName: string }>;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (id: string) => void;
  onSetFeatured: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Photos & videos</h2>
        <p className="text-sm text-muted-foreground">
          Upload high-quality photos. The first image is featured by default.
        </p>
      </div>
      <div className="space-y-3">
        {props.uploadedMedia.length > 0 ? (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {props.uploadedMedia.map((media) => (
              <li
                key={media.id}
                className={`relative rounded-md border overflow-hidden ${
                  media.isFeatured ? "ring-2 ring-primary" : ""
                }`}
              >
                { }
                <img
                  src={media.url}
                  alt={media.fileName}
                  className="w-full h-32 object-cover"
                />
                {media.isFeatured ? (
                  <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium">
                    <Star className="h-3 w-3" aria-hidden="true" />
                    Featured
                  </span>
                ) : null}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between bg-black/50 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => props.onSetFeatured(media.id)}
                    className="text-xs text-white hover:underline"
                  >
                    Set featured
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDelete(media.id)}
                    className="text-xs text-white hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <label
          htmlFor="photo-upload"
          className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 p-6 cursor-pointer hover:bg-muted/50"
        >
          {props.uploading ? (
            <Spinner className="mb-2" />
          ) : (
            <Upload className="h-6 w-6 mb-2 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm text-muted-foreground">
            Click to upload (or drag-and-drop on desktop)
          </span>
          <input
            id="photo-upload"
            type="file"
            className="sr-only"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,video/*"
            onChange={props.onUpload}
            disabled={props.uploading}
          />
        </label>
      </div>
    </div>
  );
}

function DescriptionStep(props: {
  description: string;
  setDescription: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Description</h2>
        <p className="text-sm text-muted-foreground">
          Describe the property in detail. Plain text only (no HTML).
        </p>
      </div>
      <Textarea
        value={props.description}
        onChange={(e) => props.setDescription(e.target.value)}
        rows={10}
        maxLength={5000}
        placeholder="Describe the property's key features, condition, and surroundings."
      />
      <p className="text-xs text-muted-foreground">
        {props.description.length} / 5000 characters
      </p>
    </div>
  );
}

function PreviewStep(props: {
  title: string;
  transactionType: "rent" | "sale" | "shortlet";
  price: number;
  priceFrequency: string | null;
  currency: "NGN" | "USD";
  state: string;
  city: string;
  area: string;
  landmark: string;
  description: string;
  uploadedMedia: Array<{ id: string; url: string; isFeatured: boolean; fileName: string }>;
  selectedAmenities: Set<string>;
  amenities: AmenityRow[];
  listedBy: {
    fullName: string;
    role: "landlord" | "agent" | "company";
    verificationState: "unverified" | "pending" | "bronze" | "blue" | "rejected" | "suspended" | "revoked";
  };
}) {
  const featured = props.uploadedMedia.find((m) => m.isFeatured) ?? props.uploadedMedia[0];
  const priceDisplay = props.price > 0 ? formatNaira(props.price) : "—";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm text-info-foreground">
        <strong>Preview mode</strong> — this is what your listing will look
        like once published. Review it carefully before clicking Publish.
      </div>
      <div className="space-y-3">
        {featured ? (
           
          <img
            src={featured.url}
            alt={props.title}
            className="w-full h-64 sm:h-80 object-cover rounded-md"
          />
        ) : null}
        <h2 className="text-xl font-bold">{props.title || "Untitled listing"}</h2>
        <p className="text-lg font-semibold text-primary">
          {priceDisplay}
          {props.priceFrequency ? ` / ${props.priceFrequency.replace(/_/g, " ")}` : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {[props.area, props.city, props.state].filter(Boolean).join(", ") || "Location not set"}
          {props.landmark ? ` · Near ${props.landmark}` : null}
        </p>
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {props.description || "Description not set"}
        </p>
        <div className="rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Listed by</p>
          <div className="flex items-center gap-2">
            <span className="font-medium">{props.listedBy.fullName}</span>
            <VerificationBadge
              state={props.listedBy.verificationState}
              hideWhenNotBadged
              compact
            />
            <span className="text-xs text-muted-foreground capitalize">
              {props.listedBy.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublishStep(props: {
  title: string;
  propertyId: string | null;
  onPublish: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Ready to publish?</h2>
        <p className="text-sm text-muted-foreground">
          Once published, your listing will be visible in the marketplace.
          You can edit it at any time, and unpublish if needed.
        </p>
      </div>
      <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
        <p className="font-medium">{props.title || "Untitled listing"}</p>
        <p className="text-xs text-muted-foreground">
          By publishing, you confirm:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>The property details are accurate to the best of your knowledge.</li>
          <li>You are authorised to list this property.</li>
          <li>You understand Shelty does not verify every listing.</li>
        </ul>
      </div>
      <Button onClick={props.onPublish} disabled={props.pending} className="w-full">
        {props.pending ? (
          <>
            <Spinner className="mr-2" />
            Publishing...
          </>
        ) : (
          "Publish listing"
        )}
      </Button>
    </div>
  );
}
