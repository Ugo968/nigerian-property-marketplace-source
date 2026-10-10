import { describe, it, expect } from "bun:test";
import {
  computeProfileCompleteness,
  isOnboardingComplete,
} from "@/lib/profiles/completeness";
import type {
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers — build minimal valid profile rows for testing.
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000002",
    role: "landlord",
    full_name: "Ada Obi",
    phone: "+2348031234567",
    phone_verified: false,
    email_verified: false,
    verification_state: "unverified",
    subscription_tier: "free",
    avatar_url: null,
    bio: null,
    areas_served: null,
    social_handles: {},
    onboarding_completed: false,
    account_status: "pending",
    deleted_at: null,
    preferred_location: null,
    suspended_at: null,
    suspended_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeLandlord(
  overrides: Partial<LandlordProfileRow> = {},
): LandlordProfileRow {
  return {
    profile_id: "00000000-0000-0000-0000-000000000001",
    preferred_contact_method: null,
    preferred_contact_value: null,
    ownership_summary: null,
    profile_completeness: 0,
    verification_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentProfileRow> = {}): AgentProfileRow {
  return {
    profile_id: "00000000-0000-0000-0000-000000000001",
    professional_name: null,
    agency_name: null,
    agency_id: null,
    years_of_experience: null,
    license_number: null,
    license_issuing_body: null,
    professional_description: null,
    portfolio_url: null,
    profile_completeness: 0,
    verification_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCompany(
  overrides: Partial<CompanyProfileRow> = {},
): CompanyProfileRow {
  return {
    profile_id: "00000000-0000-0000-0000-000000000001",
    company_name: null,
    company_logo_url: null,
    company_description: null,
    cac_registration_number: null,
    cac_registered: false,
    office_address: null,
    office_state: null,
    office_lga: null,
    website: null,
    social_handles: {},
    profile_completeness: 0,
    verification_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("profile completeness — landlord", () => {
  it("returns 0% for an empty profile", () => {
    const result = computeProfileCompleteness(
      "landlord",
      makeProfile({ full_name: "", phone: null }),
      null,
    );
    expect(result.percentage).toBe(0);
    expect(result.meetsMinimum).toBe(false);
  });

  it("returns ~meetsMinimum true when name + phone + location are filled", () => {
    const result = computeProfileCompleteness(
      "landlord",
      makeProfile({
        full_name: "Ada Obi",
        phone: "+2348031234567",
        preferred_location: "Lekki, Lagos",
      }),
      null,
    );
    expect(result.meetsMinimum).toBe(true);
    // 15 + 15 + 15 = 45 minimum
    expect(result.percentage).toBeGreaterThanOrEqual(45);
  });

  it("reaches 100% when all fields are complete", () => {
    const result = computeProfileCompleteness(
      "landlord",
      makeProfile({
        full_name: "Ada Obi",
        phone: "+2348031234567",
        avatar_url: "https://example.com/me.jpg",
        preferred_location: "Lekki, Lagos",
        bio: "I own properties.",
      }),
      makeLandlord({
        preferred_contact_method: "phone",
        ownership_summary: "3 properties in Lagos.",
      }),
    );
    expect(result.percentage).toBe(100);
    expect(result.meetsMinimum).toBe(true);
  });

  it("isOnboardingComplete returns false for empty profile", () => {
    expect(
      isOnboardingComplete(
        "landlord",
        makeProfile({ full_name: "", phone: null }),
        null,
      ),
    ).toBe(false);
  });

  it("isOnboardingComplete returns true when minimum met", () => {
    expect(
      isOnboardingComplete(
        "landlord",
        makeProfile({
          full_name: "Ada Obi",
          phone: "+2348031234567",
          preferred_location: "Lekki",
        }),
        null,
      ),
    ).toBe(true);
  });
});

describe("profile completeness — agent", () => {
  it("returns 0% for an empty agent", () => {
    const result = computeProfileCompleteness(
      "agent",
      makeProfile({ role: "agent", full_name: "", phone: null }),
      null,
    );
    expect(result.percentage).toBe(0);
    expect(result.meetsMinimum).toBe(false);
  });

  it("meetsMinimum requires name, phone, professional name, areas served", () => {
    const result = computeProfileCompleteness(
      "agent",
      makeProfile({
        role: "agent",
        full_name: "Ada Obi",
        phone: "+2348031234567",
        areas_served: ["Lagos"],
      }),
      makeAgent({ professional_name: "Ada Properties" }),
    );
    expect(result.meetsMinimum).toBe(true);
  });

  it("meetsMinimum false when areas served missing", () => {
    const result = computeProfileCompleteness(
      "agent",
      makeProfile({
        role: "agent",
        full_name: "Ada Obi",
        phone: "+2348031234567",
        areas_served: null,
      }),
      makeAgent({ professional_name: "Ada Properties" }),
    );
    expect(result.meetsMinimum).toBe(false);
  });

  it("reaches 100% when all fields are complete", () => {
    const result = computeProfileCompleteness(
      "agent",
      makeProfile({
        role: "agent",
        full_name: "Ada Obi",
        phone: "+2348031234567",
        avatar_url: "https://example.com/me.jpg",
        bio: "Experienced Lagos agent.",
        areas_served: ["Lekki", "Ikoyi"],
        social_handles: { instagram: "@ada" },
      }),
      makeAgent({
        professional_name: "Ada Properties",
        years_of_experience: 5,
        agency_name: "Obi Realty",
        professional_description: "Experienced Lagos agent.",
        portfolio_url: "https://ada.example.com",
      }),
    );
    expect(result.percentage).toBe(100);
  });
});

describe("profile completeness — company", () => {
  it("returns 0% for an empty company", () => {
    const result = computeProfileCompleteness(
      "company",
      makeProfile({ role: "company", full_name: "", phone: null }),
      null,
    );
    expect(result.percentage).toBe(0);
    expect(result.meetsMinimum).toBe(false);
  });

  it("meetsMinimum requires company name, description, office address, phone", () => {
    const result = computeProfileCompleteness(
      "company",
      makeProfile({
        role: "company",
        full_name: "Obi Realty Ltd",
        phone: "+2348031234567",
      }),
      makeCompany({
        company_name: "Obi Realty Ltd",
        company_description: "We are a Lagos-based real estate company.",
        office_address: "123 Victoria Island Way",
      }),
    );
    expect(result.meetsMinimum).toBe(true);
  });

  it("meetsMinimum false when office address missing", () => {
    const result = computeProfileCompleteness(
      "company",
      makeProfile({
        role: "company",
        full_name: "Obi Realty Ltd",
        phone: "+2348031234567",
      }),
      makeCompany({
        company_name: "Obi Realty Ltd",
        company_description: "We are a Lagos-based real estate company.",
        office_address: null,
      }),
    );
    expect(result.meetsMinimum).toBe(false);
  });

  it("reaches 100% when all fields are complete", () => {
    const result = computeProfileCompleteness(
      "company",
      makeProfile({
        role: "company",
        full_name: "Obi Realty Ltd",
        phone: "+2348031234567",
        avatar_url: "https://example.com/logo.png",
        social_handles: { linkedin: "obi-realty" },
      }),
      makeCompany({
        company_name: "Obi Realty Ltd",
        company_logo_url: "https://example.com/logo.png",
        company_description: "We are a Lagos-based real estate company.",
        office_address: "123 Victoria Island Way",
        office_state: "Lagos",
        website: "https://obirealty.com",
        cac_registered: true,
        cac_registration_number: "RC1234567",
        social_handles: { linkedin: "obi-realty" },
      }),
    );
    expect(result.percentage).toBe(100);
  });
});

describe("profile completeness — checklist shape", () => {
  it("checklist has the right number of items per role", () => {
    const landlord = computeProfileCompleteness(
      "landlord",
      makeProfile(),
      null,
    );
    expect(landlord.checklist.length).toBe(7);

    const agent = computeProfileCompleteness(
      "agent",
      makeProfile({ role: "agent" }),
      null,
    );
    expect(agent.checklist.length).toBe(10);

    const company = computeProfileCompleteness(
      "company",
      makeProfile({ role: "company" }),
      null,
    );
    expect(company.checklist.length).toBe(9);
  });

  it("checklist weights sum to 100 per role", () => {
    const landlord = computeProfileCompleteness(
      "landlord",
      makeProfile(),
      null,
    );
    const sumLandlord = landlord.checklist.reduce(
      (acc, item) => acc + item.weight,
      0,
    );
    expect(sumLandlord).toBe(100);

    const agent = computeProfileCompleteness(
      "agent",
      makeProfile({ role: "agent" }),
      null,
    );
    const sumAgent = agent.checklist.reduce((acc, item) => acc + item.weight, 0);
    expect(sumAgent).toBe(100);

    const company = computeProfileCompleteness(
      "company",
      makeProfile({ role: "company" }),
      null,
    );
    const sumCompany = company.checklist.reduce(
      (acc, item) => acc + item.weight,
      0,
    );
    expect(sumCompany).toBe(100);
  });
});
