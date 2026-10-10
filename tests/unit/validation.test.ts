import { describe, it, expect } from "bun:test";
import {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  landlordOnboardingSchema,
  agentOnboardingSchema,
  companyOnboardingSchema,
} from "@/lib/validation";
import type {
  SignupInput,
  LoginInput,
  LandlordOnboardingInput,
  AgentOnboardingInput,
  CompanyOnboardingInput,
} from "@/lib/validation";

// Helper: a known-good signup input.
function validSignupInput(overrides: Partial<SignupInput> = {}): SignupInput {
  return {
    fullName: "Ada Obi",
    email: "ada@example.com",
    phone: "0803 123 4567",
    password: "SecurePassword1",
    confirmPassword: "SecurePassword1",
    role: "landlord",
    acceptSafetyWarning: true,
    ...overrides,
  };
}

describe("signup schema", () => {
  it("accepts a valid signup", () => {
    const result = signupSchema.safeParse(validSignupInput());
    expect(result.success).toBe(true);
  });

  it("accepts all four marketplace roles", () => {
    for (const role of ["landlord", "agent", "company", "tenant"] as const) {
      const result = signupSchema.safeParse(validSignupInput({ role }));
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ email: "not-an-email" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects weak password (missing uppercase)", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ password: "lowercase1", confirmPassword: "lowercase1" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects weak password (missing digit)", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ password: "NoDigitsHere", confirmPassword: "NoDigitsHere" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects short password (<8 chars)", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ password: "Short1", confirmPassword: "Short1" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects password mismatch", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ confirmPassword: "DifferentPassword1" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects missing role", () => {
    const input = validSignupInput();
    delete (input as { role?: string }).role;
    const result = signupSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid role (e.g. 'admin')", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ role: "admin" as unknown as "landlord" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects advertiser as a marketplace role", () => {
    // Per spec, advertisers are NOT a fourth marketplace role.
    const result = signupSchema.safeParse(
      validSignupInput({ role: "advertiser" as unknown as "landlord" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unaccepted safety warning", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ acceptSafetyWarning: false as unknown as true }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects invalid phone format", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ phone: "555-1234" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a malicious role value like 'super-admin'", () => {
    const result = signupSchema.safeParse(
      validSignupInput({ role: "super-admin" as unknown as "landlord" }),
    );
    expect(result.success).toBe(false);
  });
});

describe("login schema", () => {
  function validLogin(overrides: Partial<LoginInput> = {}): LoginInput {
    return { email: "user@example.com", password: "Password1", ...overrides };
  }

  it("accepts a valid login", () => {
    expect(loginSchema.safeParse(validLogin()).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(loginSchema.safeParse(validLogin({ email: "no" })).success).toBe(false);
  });

  it("rejects empty password", () => {
    expect(loginSchema.safeParse(validLogin({ password: "" })).success).toBe(false);
  });
});

describe("password reset request schema", () => {
  it("accepts valid email", () => {
    expect(
      passwordResetRequestSchema.safeParse({ email: "a@b.com" }).success,
    ).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(
      passwordResetRequestSchema.safeParse({ email: "nope" }).success,
    ).toBe(false);
  });
});

describe("password reset schema", () => {
  it("accepts matching valid passwords", () => {
    expect(
      passwordResetSchema.safeParse({
        password: "NewPassword1",
        confirmPassword: "NewPassword1",
      }).success,
    ).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    expect(
      passwordResetSchema.safeParse({
        password: "NewPassword1",
        confirmPassword: "DifferentPassword1",
      }).success,
    ).toBe(false);
  });

  it("rejects weak password", () => {
    expect(
      passwordResetSchema.safeParse({
        password: "weak",
        confirmPassword: "weak",
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ONBOARDING SCHEMAS
// ---------------------------------------------------------------------------

describe("landlord onboarding schema", () => {
  function valid(overrides: Partial<LandlordOnboardingInput> = {}): LandlordOnboardingInput {
    return {
      avatarUrl: "",
      bio: "A short bio.",
      preferredLocation: "Lekki, Lagos",
      preferredContactMethod: "phone",
      preferredContactValue: "0803 123 4567",
      ownershipSummary: "Owns 3 properties in Lagos.",
      ...overrides,
    };
  }

  it("accepts valid input", () => {
    expect(landlordOnboardingSchema.safeParse(valid()).success).toBe(true);
  });

  it("rejects empty preferred location", () => {
    expect(landlordOnboardingSchema.safeParse(valid({ preferredLocation: "" })).success).toBe(false);
  });

  it("rejects overly-long bio", () => {
    expect(landlordOnboardingSchema.safeParse(valid({ bio: "x".repeat(501) })).success).toBe(false);
  });
});

describe("agent onboarding schema", () => {
  function valid(overrides: Partial<AgentOnboardingInput> = {}): AgentOnboardingInput {
    return {
      avatarUrl: "",
      bio: "I am an experienced agent.",
      professionalName: "Ada Obi Properties",
      yearsOfExperience: 5,
      areasServed: ["Lekki", "Ikoyi"],
      agencyName: "",
      licenseNumber: "",
      licenseIssuingBody: "",
      portfolioUrl: "",
      socialHandles: {},
      ...overrides,
    };
  }

  it("accepts valid input", () => {
    expect(agentOnboardingSchema.safeParse(valid()).success).toBe(true);
  });

  it("rejects empty areas served", () => {
    expect(agentOnboardingSchema.safeParse(valid({ areasServed: [] })).success).toBe(false);
  });

  it("rejects negative years of experience", () => {
    expect(agentOnboardingSchema.safeParse(valid({ yearsOfExperience: -1 })).success).toBe(false);
  });

  it("rejects unreasonably high years of experience", () => {
    expect(agentOnboardingSchema.safeParse(valid({ yearsOfExperience: 100 })).success).toBe(false);
  });

  it("rejects too-short bio", () => {
    expect(agentOnboardingSchema.safeParse(valid({ bio: "short" })).success).toBe(false);
  });

  it("rejects empty professional name", () => {
    expect(agentOnboardingSchema.safeParse(valid({ professionalName: "" })).success).toBe(false);
  });

  it("rejects invalid portfolio URL", () => {
    expect(agentOnboardingSchema.safeParse(valid({ portfolioUrl: "not-a-url" })).success).toBe(false);
  });
});

describe("company onboarding schema", () => {
  function valid(overrides: Partial<CompanyOnboardingInput> = {}): CompanyOnboardingInput {
    return {
      companyName: "Obi Realty Ltd",
      companyLogoUrl: "",
      companyDescription: "We are a real estate company specialising in Lagos property.",
      officeAddress: "123 Victoria Island Way",
      officeState: "Lagos",
      officeLga: "",
      contactPhone: "0803 123 4567",
      contactEmail: "hello@obirealty.com",
      website: "",
      cacRegistered: true,
      cacRegistrationNumber: "RC1234567",
      socialHandles: {},
      ...overrides,
    };
  }

  it("accepts valid input", () => {
    expect(companyOnboardingSchema.safeParse(valid()).success).toBe(true);
  });

  it("rejects empty company name", () => {
    expect(companyOnboardingSchema.safeParse(valid({ companyName: "" })).success).toBe(false);
  });

  it("rejects too-short company description", () => {
    expect(companyOnboardingSchema.safeParse(valid({ companyDescription: "short" })).success).toBe(false);
  });

  it("rejects empty office address", () => {
    expect(companyOnboardingSchema.safeParse(valid({ officeAddress: "" })).success).toBe(false);
  });

  it("rejects invalid contact phone", () => {
    expect(companyOnboardingSchema.safeParse(valid({ contactPhone: "555" })).success).toBe(false);
  });

  it("rejects invalid contact email", () => {
    expect(companyOnboardingSchema.safeParse(valid({ contactEmail: "no" })).success).toBe(false);
  });

  it("accepts CAC-registered=false with empty number", () => {
    expect(
      companyOnboardingSchema.safeParse(
        valid({ cacRegistered: false, cacRegistrationNumber: "" }),
      ).success,
    ).toBe(true);
  });
});
