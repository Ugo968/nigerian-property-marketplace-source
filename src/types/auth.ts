/**
 * Core user-role types.
 *
 * The marketplace has exactly FOUR primary account roles. A user picks
 * one during registration; one account → one role. Other housing-related
 * businesses (carpenters, plumbers, etc.) use the separate ADVERTISING
 * system and are NOT a fifth role.
 *
 * Centralised here so future code never invents conflicting string values.
 */

export const USER_ROLES = ["landlord", "agent", "company", "tenant"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Display labels for each role. Use this in UI; never hard-code strings.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  landlord: "Landlord / Property Owner",
  agent: "Real Estate Agent / Realtor",
  company: "Real Estate Company",
  tenant: "Tenant / Property Seeker",
};

/**
 * Short marketing-style description shown on the signup role picker.
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  landlord:
    "You own property and want to list, manage, and work with agents.",
  agent:
    "You are an independent agent. Discover properties, apply to represent them, and build your reputation.",
  company:
    "You run a real-estate business with multiple properties, agents, and staff.",
  tenant:
    "You are looking for a property to rent, buy, or short-let. Browse listings and contact landlords directly.",
};
