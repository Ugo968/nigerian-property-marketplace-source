import type { UserRole } from "./auth";

/**
 * Agent application status machine.
 *
 * Property owners / companies receive applications from agents who want
 * to represent their properties. This is the lifecycle of an application.
 *
 * NEVER destroy an existing legitimate conversation because a user hit
 * a monthly limit. Limits restrict STARTING additional eligible
 * conversations.
 */
export const APPLICATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
  "completed",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
  completed: "Completed",
};

/**
 * Allowed transitions between application statuses.
 * Use this in services to validate state-machine moves.
 */
export const APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  pending: ["accepted", "declined", "withdrawn", "expired"],
  accepted: ["completed", "withdrawn"],
  declined: [],
  withdrawn: [],
  expired: [],
  completed: [],
};

/**
 * Who can perform a given transition. Used for authorization.
 */
export const APPLICATION_TRANSITION_ACTORS: Record<
  ApplicationStatus,
  Partial<Record<ApplicationStatus, UserRole | "admin">>
> = {
  pending: {
    accepted: "landlord",
    declined: "landlord",
    withdrawn: "agent",
    expired: "admin",
  },
  accepted: {
    completed: "admin",
    withdrawn: "agent",
  },
  declined: {},
  withdrawn: {},
  expired: {},
  completed: {},
};

/**
 * Property transaction workflow (V1 boundary).
 *
 * The platform tracks the deal workflow but does NOT hold money.
 * All actual rent/purchase money moves externally between buyer/tenant
 * and the property owner / authorised party.
 */
export const DEAL_STAGES = [
  "inquiry",
  "inspection_scheduled",
  "inspection_completed",
  "negotiation",
  "offer_made",
  "offer_accepted",
  "transaction_completed",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  inquiry: "Inquiry",
  inspection_scheduled: "Inspection Scheduled",
  inspection_completed: "Inspection Completed",
  negotiation: "Negotiation",
  offer_made: "Offer Made",
  offer_accepted: "Offer Accepted",
  transaction_completed: "Transaction Completed",
};
