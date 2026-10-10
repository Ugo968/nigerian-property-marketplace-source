"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Star, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/feedback";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updatePropertyStep,
  publishProperty,
  unpublishProperty,
  markPropertyRented,
  markPropertySold,
  markPropertyUnavailable,
  removeProperty,
} from "@/lib/properties/actions";
import {
  uploadPropertyMedia,
  deletePropertyMedia,
  setFeaturedPropertyMedia,
} from "@/lib/properties/media-actions";
import { checkTitleQuality } from "@/lib/properties/anti-spam";
import { isPubliclyVisible } from "@/lib/properties/status-machine";
import { formatNaira } from "@/lib/subscriptions/plans";
import { VerificationBadge } from "@/components/verification-badge";
import type { PropertyRow, PropertyLocationRow, PropertyTypeRow, AmenityRow } from "@/types";

interface MediaWithUrl extends PropertyMediaRow {
  url: string;
}

interface PropertyEditFormProps {
  property: PropertyRow;
  location: PropertyLocationRow | null;
  media: MediaWithUrl[];
  propertyTypes: PropertyTypeRow[];
  amenities: AmenityRow[];
  selectedAmenityIds: string[];
  listedBy: {
    fullName: string;
    role: "landlord" | "agent" | "company";
    verificationState: PropertyRow["furnished_status"] extends never ? never : "unverified" | "pending" | "bronze" | "blue" | "rejected" | "suspended" | "revoked";
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  available: "Available",
  application_pending: "Application Pending",
  under_offer: "Under Offer",
  rented: "Rented",
  sold: "Sold",
  unavailable: "Unavailable",
  suspended: "Suspended",
  removed: "Removed",
};

export function PropertyEditForm({
  property,
  location,
  media,
  propertyTypes,
  amenities,
  selectedAmenityIds,
  listedBy,
}: PropertyEditFormProps) {
  const router = useRouter();

  // Local state mirrors the property fields
  const [title, setTitle] = React.useState(property.title);
  const [bedrooms, setBedrooms] = React.useState(property.bedrooms);
  const [bathrooms, setBathrooms] = React.useState(property.bathrooms);
  const [toilets, setToilets] = React.useState(property.toilets);
  const [parkingSpaces, setParkingSpaces] = React.useState(property.parking_spaces);
  const [yearBuilt, setYearBuilt] = React.useState<number | "">(
    property.year_built ?? "",
  );
  const [floors, setFloors] = React.useState<number | "">(property.floors ?? "");

  const [price, setPrice] = React.useState<number | "">(
    property.price === 0 ? "" : property.price,
  );
  const [priceFrequency, setPriceFrequency] = React.useState<string | null>(
    property.price_frequency,
  );

  const [state, setState] = React.useState(location?.state ?? "");
  const [city, setCity] = React.useState(location?.city ?? "");
  const [area, setArea] = React.useState(location?.area ?? "");
  const [landmark, setLandmark] = React.useState(location?.landmark ?? "");
  const [addressLine, setAddressLine] = React.useState(location?.address_line ?? "");
  const [privateLat, setPrivateLat] = React.useState<number | "">(
    location?.private_lat ?? "",
  );
  const [privateLng, setPrivateLng] = React.useState<number | "">(
    location?.private_lng ?? "",
  );

  const [description, setDescription] = React.useState(property.description ?? "");
  const [furnishedStatus, setFurnishedStatus] = React.useState(property.furnished_status);
  const [sizeValue, setSizeValue] = React.useState<number | "">(
    property.size_value ?? "",
  );
  const [sizeUnit, setSizeUnit] = React.useState<string>(property.size_unit ?? "");
  const [selectedAmenities, setSelectedAmenities] = React.useState<Set<string>>(
    new Set(selectedAmenityIds),
  );

  const [mediaList, setMediaList] = React.useState<MediaWithUrl[]>(media);

  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [topSuccess, setTopSuccess] = React.useState<string | null>(null);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------
  async function handleSaveSection(step: "basic_details" | "pricing" | "location" | "features" | "description", data: Record<string, unknown>) {
    setPending(true);
    setTopError(null);
    setTopSuccess(null);
    const result = await updatePropertyStep({ propertyId: property.id, step, data });
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Failed to save");
      return false;
    }
    setTopSuccess("Saved");
    setTimeout(() => setTopSuccess(null), 2000);
    return true;
  }

  async function handleSaveBasic() {
    return handleSaveSection("basic_details", {
      title,
      bedrooms,
      bathrooms,
      toilets,
      parkingSpaces,
      yearBuilt: yearBuilt === "" ? undefined : Number(yearBuilt),
      floors: floors === "" ? undefined : Number(floors),
    });
  }
  async function handleSavePricing() {
    return handleSaveSection("pricing", {
      price: price === "" ? 0 : Number(price),
      currency: property.currency,
      priceFrequency,
    });
  }
  async function handleSaveLocation() {
    return handleSaveSection("location", {
      country: location?.country ?? "Nigeria",
      state,
      city,
      area,
      landmark,
      addressLine,
      addressLga: location?.address_lga ?? "",
      privateLat: privateLat === "" ? undefined : Number(privateLat),
      privateLng: privateLng === "" ? undefined : Number(privateLng),
      publicLat: privateLat === "" ? undefined : Math.round(Number(privateLat) * 1000) / 1000,
      publicLng: privateLng === "" ? undefined : Math.round(Number(privateLng) * 1000) / 1000,
    });
  }
  async function handleSaveFeatures() {
    return handleSaveSection("features", {
      furnishedStatus,
      sizeValue: sizeValue === "" ? undefined : Number(sizeValue),
      sizeUnit: sizeUnit || undefined,
      amenityIds: Array.from(selectedAmenities),
    });
  }
  async function handleSaveDescription() {
    return handleSaveSection("description", { description });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
      propertyId: property.id,
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
      setMediaList((prev) => [
        ...prev,
        {
          ...({} as MediaWithUrl),
          id: result.mediaId!,
          property_id: property.id,
          media_type: "image",
          storage_path: result.mediaUrl!,
          url: result.mediaUrl!,
          file_name: file.name,
          mime_type: "image/jpeg",
          size_bytes: file.size,
          sort_order: prev.length,
          is_featured: prev.length === 0,
          uploaded_at: new Date().toISOString(),
        },
      ]);
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    setMediaList((prev) => prev.filter((m) => m.id !== mediaId));
    await deletePropertyMedia({ propertyId: property.id, mediaId });
  }

  async function handleSetFeatured(mediaId: string) {
    setMediaList((prev) =>
      prev.map((m) => ({ ...m, is_featured: m.id === mediaId })),
    );
    await setFeaturedPropertyMedia({ propertyId: property.id, mediaId });
  }

  async function handlePublish() {
    setPending(true);
    setTopError(null);
    // Save all sections first
    const saved = await Promise.all([
      handleSaveBasic(),
      handleSavePricing(),
      handleSaveLocation(),
      handleSaveFeatures(),
      handleSaveDescription(),
    ]);
    if (!saved.every(Boolean)) {
      setPending(false);
      setTopError("Please fix the errors above before publishing.");
      return;
    }
    const result = await publishProperty(property.id);
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Publish failed");
      return;
    }
    if (result.redirectTo) {
      router.push(result.redirectTo);
    }
  }

  async function handleStatusAction(action: "unpublish" | "rent" | "sell" | "unavailable" | "remove") {
    setPending(true);
    setTopError(null);
    let result;
    switch (action) {
      case "unpublish":
        result = await unpublishProperty(property.id);
        break;
      case "rent":
        result = await markPropertyRented(property.id);
        break;
      case "sell":
        result = await markPropertySold(property.id);
        break;
      case "unavailable":
        result = await markPropertyUnavailable(property.id);
        break;
      case "remove":
        if (!confirm("Remove this listing? It can be restored later by an admin.")) {
          setPending(false);
          return;
        }
        result = await removeProperty(property.id);
        break;
    }
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Action failed");
      return;
    }
    router.refresh();
  }

  const titleQuality = title.length > 0 ? checkTitleQuality(title) : null;
  const propertyType = propertyTypes.find((t) => t.id === property.property_type_id);
  const showFurnished = propertyType?.category !== "land";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{property.title}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {STATUS_LABELS[property.status] ?? property.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Edit your listing. Save each section, then publish when ready.
          </p>
        </div>
        <div className="flex gap-2">
          {isPubliclyVisible(property.status) ? (
            <Button asChild variant="outline">
              <Link href={`/properties/${property.id}`}>View public</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Status action menu */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-2">
          {property.status === "draft" || property.status === "unavailable" ? (
            <Button onClick={handlePublish} disabled={pending}>
              {pending ? "Working..." : "Publish"}
            </Button>
          ) : null}
          {isPubliclyVisible(property.status) ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleStatusAction("unpublish")}
                disabled={pending}
              >
                Unpublish
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusAction("rent")}
                disabled={pending}
              >
                Mark rented
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusAction("sell")}
                disabled={pending}
              >
                Mark sold
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusAction("unavailable")}
                disabled={pending}
              >
                Mark unavailable
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            onClick={() => handleStatusAction("remove")}
            disabled={pending}
          >
            Remove
          </Button>
        </CardContent>
      </Card>

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

      {/* Basic details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                value={bedrooms}
                onChange={(e) => setBedrooms(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                type="number"
                min={0}
                max={50}
                value={bathrooms}
                onChange={(e) => setBathrooms(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toilets">Toilets</Label>
              <Input
                id="toilets"
                type="number"
                min={0}
                max={50}
                value={toilets}
                onChange={(e) => setToilets(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="yearBuilt">Year built</Label>
              <Input
                id="yearBuilt"
                type="number"
                min={1800}
                value={yearBuilt}
                onChange={(e) =>
                  setYearBuilt(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parkingSpaces">Parking spaces</Label>
              <Input
                id="parkingSpaces"
                type="number"
                min={0}
                value={parkingSpaces}
                onChange={(e) => setParkingSpaces(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floors">Floors</Label>
              <Input
                id="floors"
                type="number"
                min={0}
                value={floors}
                onChange={(e) =>
                  setFloors(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
          </div>
          <Button onClick={handleSaveBasic} disabled={pending} variant="outline">
            Save basic
          </Button>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Price ({property.currency})</Label>
              <Input
                id="price"
                type="number"
                min={0}
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="freq">Frequency</Label>
              <select
                id="freq"
                value={priceFrequency ?? ""}
                onChange={(e) => setPriceFrequency(e.target.value || null)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={property.transaction_type === "sale"}
              >
                {property.transaction_type === "sale" ? (
                  <option value="one_off">Total</option>
                ) : (
                  <>
                    <option value="">Select...</option>
                    {property.transaction_type === "rent" ? (
                      <>
                        <option value="per_month">Per month</option>
                        <option value="per_year">Per year</option>
                      </>
                    ) : (
                      <>
                        <option value="per_night">Per night</option>
                        <option value="per_day">Per day</option>
                        <option value="per_week">Per week</option>
                        <option value="per_month">Per month</option>
                      </>
                    )}
                  </>
                )}
              </select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Display: <span className="font-medium text-foreground">
              {price === "" ? "—" : formatNaira(Number(price))}
            </span>
            {priceFrequency ? ` / ${priceFrequency.replace(/_/g, " ")}` : null}
          </p>
          <Button onClick={handleSavePricing} disabled={pending} variant="outline">
            Save pricing
          </Button>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="area">Area</Label>
              <Input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="landmark">Landmark</Label>
              <Input
                id="landmark"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addressLine">Private exact address (not public)</Label>
            <Input
              id="addressLine"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                type="number"
                step="0.000001"
                value={privateLat}
                onChange={(e) =>
                  setPrivateLat(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                type="number"
                step="0.000001"
                value={privateLng}
                onChange={(e) =>
                  setPrivateLng(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
          </div>
          <Button onClick={handleSaveLocation} disabled={pending} variant="outline">
            Save location
          </Button>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features & amenities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showFurnished ? (
            <div className="space-y-1.5">
              <Label>Furnished status</Label>
              <div className="flex flex-wrap gap-2">
                {(["furnished", "semi_furnished", "unfurnished", "not_applicable"] as const).map(
                  (status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFurnishedStatus(status)}
                      className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                        furnishedStatus === status
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
              <Label htmlFor="sizeValue">Size</Label>
              <Input
                id="sizeValue"
                type="number"
                min={0}
                step="0.01"
                value={sizeValue}
                onChange={(e) =>
                  setSizeValue(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sizeUnit">Size unit</Label>
              <select
                id="sizeUnit"
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select...</option>
                <option value="sqm">sqm</option>
                <option value="sqft">sqft</option>
                <option value="acre">acre</option>
                <option value="hectare">hectare</option>
                <option value="plot">plot</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Amenities</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {amenities
                .filter((a) => a.is_active)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((amenity) => {
                  const checked = selectedAmenities.has(amenity.id);
                  return (
                    <label
                      key={amenity.id}
                      htmlFor={`am-${amenity.id}`}
                      className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        id={`am-${amenity.id}`}
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedAmenities);
                          if (v) next.add(amenity.id);
                          else next.delete(amenity.id);
                          setSelectedAmenities(next);
                        }}
                      />
                      {amenity.label}
                    </label>
                  );
                })}
            </div>
          </div>
          <Button onClick={handleSaveFeatures} disabled={pending} variant="outline">
            Save features
          </Button>
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos & videos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mediaList.length > 0 ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mediaList.map((m) => (
                <li
                  key={m.id}
                  className={`relative rounded-md border overflow-hidden ${
                    m.is_featured ? "ring-2 ring-primary" : ""
                  }`}
                >
                  { }
                  <img
                    src={m.url}
                    alt={m.file_name}
                    className="w-full h-32 object-cover"
                  />
                  {m.is_featured ? (
                    <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      Featured
                    </span>
                  ) : null}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between bg-black/50 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => handleSetFeatured(m.id)}
                      className="text-xs text-white hover:underline"
                    >
                      Set featured
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMedia(m.id)}
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
            htmlFor="upload-photo"
            className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 p-6 cursor-pointer hover:bg-muted/50"
          >
            {uploading ? (
              <Spinner className="mb-2" />
            ) : (
              <Upload className="h-6 w-6 mb-2 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="text-sm text-muted-foreground">Upload photo or video</span>
            <input
              id="upload-photo"
              type="file"
              className="sr-only"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,video/*"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            maxLength={5000}
          />
          <p className="text-xs text-muted-foreground">
            {description.length} / 5000 characters
          </p>
          <Button onClick={handleSaveDescription} disabled={pending} variant="outline">
            Save description
          </Button>
        </CardContent>
      </Card>

      {/* Listed by */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listed by</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="font-medium">{listedBy.fullName}</span>
            <VerificationBadge
              state={listedBy.verificationState as never}
              hideWhenNotBadged
              compact
            />
            <span className="text-xs text-muted-foreground capitalize">
              {listedBy.role}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Ownership is managed separately and cannot be edited here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
