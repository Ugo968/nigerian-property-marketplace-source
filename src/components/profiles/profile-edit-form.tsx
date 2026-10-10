"use client";

import * as React from "react";
import { AlertCircle, Camera, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/feedback";
import { computeProfileCompleteness } from "@/lib/profiles/completeness";
import {
  updateBasicProfile,
  updateSocialHandles,
  updateLandlordProfile,
  updateAgentProfile,
  updateCompanyProfile,
  uploadProfilePhoto,
} from "@/lib/profiles/edit-actions";
import { capabilitiesFor } from "@/lib/capabilities";
import type {
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
} from "@/types";

/**
 * Profile edit form — single-page form with sections for basic info,
 * role-specific info, social links (Premium-only), and photo upload.
 *
 * Per spec Section 21:
 *   * Sections: basic info, role-specific, social links, verification (link), account
 *   * Cannot edit: role, verification status, subscription level, account status, audit records
 *
 * Per spec Section 22 + 23: social links are capability-gated (Premium only).
 */
interface ProfileEditFormProps {
  profile: ProfileRow;
  landlord: LandlordProfileRow | null;
  agent: AgentProfileRow | null;
  company: CompanyProfileRow | null;
}

export function ProfileEditForm({
  profile,
  landlord,
  agent,
  company,
}: ProfileEditFormProps) {
  // Basic info
  const [fullName, setFullName] = React.useState(profile.full_name);
  const [phone, setPhone] = React.useState(profile.phone ?? "");
  const [bio, setBio] = React.useState(profile.bio ?? "");
  const [preferredLocation, setPreferredLocation] = React.useState(
    profile.preferred_location ?? "",
  );

  // Social handles
  const [socialHandles, setSocialHandles] = React.useState<Record<string, string>>(
    profile.social_handles ?? {},
  );
  const [newHandleKey, setNewHandleKey] = React.useState("");
  const [newHandleValue, setNewHandleValue] = React.useState("");

  // Role-specific
  const [landlordData, setLandlordData] = React.useState({
    preferred_contact_method: landlord?.preferred_contact_method ?? "",
    preferred_contact_value: landlord?.preferred_contact_value ?? "",
    ownership_summary: landlord?.ownership_summary ?? "",
  });

  const [agentData, setAgentData] = React.useState({
    professional_name: agent?.professional_name ?? "",
    agency_name: agent?.agency_name ?? "",
    years_of_experience: agent?.years_of_experience?.toString() ?? "",
    license_number: agent?.license_number ?? "",
    license_issuing_body: agent?.license_issuing_body ?? "",
    professional_description: agent?.professional_description ?? "",
    portfolio_url: agent?.portfolio_url ?? "",
  });

  const [companyData, setCompanyData] = React.useState({
    company_name: company?.company_name ?? "",
    company_description: company?.company_description ?? "",
    office_address: company?.office_address ?? "",
    office_state: company?.office_state ?? "",
    office_lga: company?.office_lga ?? "",
    website: company?.website ?? "",
    cac_registered: company?.cac_registered ?? false,
    cac_registration_number: company?.cac_registration_number ?? "",
  });

  // UI state
  const [pendingBasic, setPendingBasic] = React.useState(false);
  const [pendingRole, setPendingRole] = React.useState(false);
  const [pendingSocial, setPendingSocial] = React.useState(false);
  const [pendingPhoto, setPendingPhoto] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [topSuccess, setTopSuccess] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const caps = capabilitiesFor(profile.role, profile.subscription_tier);

  // Live completeness preview
  const completeness = computeProfileCompleteness(
    profile.role,
    { ...profile, full_name: fullName, phone, bio: bio || null, preferred_location: preferredLocation || null, social_handles: socialHandles },
    profile.role === "landlord" ? { ...landlord, ...landlordData } as never
      : profile.role === "agent" ? { ...agent, ...agentData, years_of_experience: agentData.years_of_experience ? Number(agentData.years_of_experience) : null } as never
      : { ...company, ...companyData } as never,
  );

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------
  async function handleBasicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPendingBasic(true);
    setTopError(null);
    setTopSuccess(null);
    const result = await updateBasicProfile({
      fullName,
      phone,
      bio,
      preferredLocation,
    });
    setPendingBasic(false);
    if (!result.ok) {
      setTopError(result.message ?? "Failed to save.");
      return;
    }
    setTopSuccess("Profile updated.");
    setTimeout(() => setTopSuccess(null), 3000);
  }

  async function handleRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPendingRole(true);
    setTopError(null);
    setTopSuccess(null);

    let result: { ok: boolean; message?: string };
    if (profile.role === "landlord") {
      result = await updateLandlordProfile({
        preferredContactMethod: landlordData.preferred_contact_method as never,
        preferredContactValue: landlordData.preferred_contact_value,
        ownershipSummary: landlordData.ownership_summary,
      });
    } else if (profile.role === "agent") {
      result = await updateAgentProfile({
        professionalName: agentData.professional_name,
        agencyName: agentData.agency_name,
        yearsOfExperience: agentData.years_of_experience
          ? Number(agentData.years_of_experience)
          : undefined,
        licenseNumber: agentData.license_number,
        licenseIssuingBody: agentData.license_issuing_body,
        professionalDescription: agentData.professional_description,
        portfolioUrl: agentData.portfolio_url,
      });
    } else {
      result = await updateCompanyProfile({
        companyName: companyData.company_name,
        companyDescription: companyData.company_description,
        officeAddress: companyData.office_address,
        officeState: companyData.office_state,
        officeLga: companyData.office_lga,
        website: companyData.website,
        cacRegistered: companyData.cac_registered,
        cacRegistrationNumber: companyData.cac_registration_number,
      });
    }

    setPendingRole(false);
    if (!result.ok) {
      setTopError(result.message ?? "Failed to save.");
      return;
    }
    setTopSuccess(`${profile.role} profile updated.`);
    setTimeout(() => setTopSuccess(null), 3000);
  }

  async function handleSocialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPendingSocial(true);
    setTopError(null);
    setTopSuccess(null);
    const result = await updateSocialHandles({ handles: socialHandles });
    setPendingSocial(false);
    if (!result.ok) {
      setTopError(result.message ?? "Failed to save social handles.");
      return;
    }
    setTopSuccess("Social handles updated.");
    setTimeout(() => setTopSuccess(null), 3000);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(true);
    setPhotoError(null);

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const first16 = bytes.slice(0, 16);
    const firstBytesBase64 = btoa(String.fromCharCode(...first16));
    const fileBufferBase64 = btoa(String.fromCharCode(...bytes));

    const result = await uploadProfilePhoto({
      fileName: file.name,
      clientMimeType: file.type,
      fileSize: file.size,
      firstBytesBase64,
      fileBufferBase64,
    });
    setPendingPhoto(false);
    e.target.value = "";
    if (!result.ok) {
      setPhotoError(result.message ?? "Upload failed.");
      return;
    }
    // Refresh page so avatar_url is fetched fresh
    window.location.reload();
  }

  function addSocialHandle() {
    const key = newHandleKey.trim().toLowerCase();
    if (!key || !newHandleValue.trim()) return;
    setSocialHandles({ ...socialHandles, [key]: newHandleValue.trim() });
    setNewHandleKey("");
    setNewHandleValue("");
  }

  function removeSocialHandle(key: string) {
    const next = { ...socialHandles };
    delete next[key];
    setSocialHandles(next);
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Completeness banner */}
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-foreground">
            Profile completeness
          </span>
          <span className="text-muted-foreground">
            {completeness.percentage}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${completeness.percentage}%` }}
          />
        </div>
      </div>

      {/* Photo upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {profile.role === "company" ? "Company logo" : "Profile photo"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={fullName}
              className="h-24 w-24 rounded-lg object-cover"
            />
          ) : null}
          <Label htmlFor="photo-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
            <Camera className="h-4 w-4" aria-hidden="true" />
            {pendingPhoto ? "Uploading..." : "Upload new"}
          </Label>
          <input
            id="photo-upload"
            type="file"
            className="sr-only"
            onChange={handlePhotoChange}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={pendingPhoto}
          />
          {photoError ? (
            <p className="text-sm text-destructive">{photoError}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBasicSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={pendingBasic}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pendingBasic}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={pendingBasic}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preferredLocation">Preferred location</Label>
              <Input
                id="preferredLocation"
                value={preferredLocation}
                onChange={(e) => setPreferredLocation(e.target.value)}
                disabled={pendingBasic}
                maxLength={120}
              />
            </div>
            <Button type="submit" disabled={pendingBasic}>
              {pendingBasic ? (
                <>
                  <Spinner className="mr-2" />
                  Saving...
                </>
              ) : (
                "Save basic info"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Role-specific */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">
            {profile.role} information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRoleSubmit} className="space-y-4">
            {profile.role === "landlord" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ownershipSummary">Ownership summary</Label>
                  <Textarea
                    id="ownershipSummary"
                    value={landlordData.ownership_summary}
                    onChange={(e) =>
                      setLandlordData({ ...landlordData, ownership_summary: e.target.value })
                    }
                    rows={3}
                    maxLength={500}
                    disabled={pendingRole}
                  />
                </div>
              </>
            ) : null}
            {profile.role === "agent" ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="professional_name">Professional name</Label>
                    <Input
                      id="professional_name"
                      value={agentData.professional_name}
                      onChange={(e) =>
                        setAgentData({ ...agentData, professional_name: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="years_of_experience">Years of experience</Label>
                    <Input
                      id="years_of_experience"
                      type="number"
                      min={0}
                      max={80}
                      value={agentData.years_of_experience}
                      onChange={(e) =>
                        setAgentData({ ...agentData, years_of_experience: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="agency_name">Agency name</Label>
                    <Input
                      id="agency_name"
                      value={agentData.agency_name}
                      onChange={(e) =>
                        setAgentData({ ...agentData, agency_name: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="license_number">License number</Label>
                    <Input
                      id="license_number"
                      value={agentData.license_number}
                      onChange={(e) =>
                        setAgentData({ ...agentData, license_number: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="professional_description">Professional description</Label>
                  <Textarea
                    id="professional_description"
                    value={agentData.professional_description}
                    onChange={(e) =>
                      setAgentData({
                        ...agentData,
                        professional_description: e.target.value,
                      })
                    }
                    rows={4}
                    maxLength={500}
                    disabled={pendingRole}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="portfolio_url">Portfolio URL</Label>
                  <Input
                    id="portfolio_url"
                    type="url"
                    value={agentData.portfolio_url}
                    onChange={(e) =>
                      setAgentData({ ...agentData, portfolio_url: e.target.value })
                    }
                    disabled={pendingRole}
                  />
                </div>
              </>
            ) : null}
            {profile.role === "company" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="company_name">Company name</Label>
                  <Input
                    id="company_name"
                    value={companyData.company_name}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, company_name: e.target.value })
                    }
                    disabled={pendingRole}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company_description">Company description</Label>
                  <Textarea
                    id="company_description"
                    value={companyData.company_description}
                    onChange={(e) =>
                      setCompanyData({
                        ...companyData,
                        company_description: e.target.value,
                      })
                    }
                    rows={4}
                    maxLength={2000}
                    disabled={pendingRole}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="office_address">Office address</Label>
                    <Input
                      id="office_address"
                      value={companyData.office_address}
                      onChange={(e) =>
                        setCompanyData({ ...companyData, office_address: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="office_state">Office state</Label>
                    <Input
                      id="office_state"
                      value={companyData.office_state}
                      onChange={(e) =>
                        setCompanyData({ ...companyData, office_state: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      value={companyData.website}
                      onChange={(e) =>
                        setCompanyData({ ...companyData, website: e.target.value })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cac_registration_number">CAC registration number</Label>
                    <Input
                      id="cac_registration_number"
                      value={companyData.cac_registration_number}
                      onChange={(e) =>
                        setCompanyData({
                          ...companyData,
                          cac_registration_number: e.target.value,
                        })
                      }
                      disabled={pendingRole}
                    />
                  </div>
                </div>
              </>
            ) : null}
            <Button type="submit" disabled={pendingRole}>
              {pendingRole ? (
                <>
                  <Spinner className="mr-2" />
                  Saving...
                </>
              ) : (
                `Save ${profile.role} info`
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Social links — capability gated */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Social media</CardTitle>
        </CardHeader>
        <CardContent>
          {caps.canShowSocialMediaHandles ? (
            <form onSubmit={handleSocialSubmit} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Platform (e.g. instagram)"
                  value={newHandleKey}
                  onChange={(e) => setNewHandleKey(e.target.value)}
                  disabled={pendingSocial}
                />
                <Input
                  placeholder="@handle"
                  value={newHandleValue}
                  onChange={(e) => setNewHandleValue(e.target.value)}
                  disabled={pendingSocial}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSocialHandle}
                  disabled={pendingSocial}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {Object.entries(socialHandles).length > 0 ? (
                <ul className="space-y-1">
                  {Object.entries(socialHandles).map(([k, v]) => (
                    <li
                      key={k}
                      className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                    >
                      <span>
                        <span className="font-medium">{k}</span>: {v}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${k}`}
                        onClick={() => removeSocialHandle(k)}
                        disabled={pendingSocial}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button type="submit" disabled={pendingSocial}>
                {pendingSocial ? (
                  <>
                    <Spinner className="mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save social handles"
                )}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Social media handles are available on the Premium plan.
              Upgrade to add them.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Account info — read-only */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Email address</dt>
              <dd className="font-medium">— managed by Supabase Auth —</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">{profile.role}</dd>
              <p className="text-xs text-muted-foreground mt-1">
                Role cannot be changed.
              </p>
            </div>
            <div>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd className="font-medium capitalize">{profile.subscription_tier}</dd>
              <p className="text-xs text-muted-foreground mt-1">
                Subscription is managed separately.
              </p>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="font-medium capitalize">{profile.verification_state}</dd>
              <p className="text-xs text-muted-foreground mt-1">
                Verification requires admin review.
              </p>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-medium">
                {new Date(profile.created_at).toLocaleDateString("en-NG", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>
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
        <div
          role="status"
          className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success"
        >
          {topSuccess}
        </div>
      ) : null}
    </div>
  );
}
