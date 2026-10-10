import type { ListingStatus } from "@/types";

/**
 * Property status state machine.
 *
 * Per spec Section 24 (listing lifecycle):
 *
 *   Draft
 *     ↓
 *   Published / Available
 *     ↓
 *   Application Pending
 *     ↓
 *   Under Offer
 *     ↓
 *   Rented / Sold
 *
 * A property may also become:
 *   - Unavailable (manually paused)
 *   - Suspended (admin)
 *   - Removed (soft-deleted)
 *
 * Per spec Section 23: status changes must be authorized. Only the
 * authorized transitions are allowed; everything else is rejected.
 */

export type PropertyStatus = ListingStatus;

export type PropertyActor = "owner" | "agent" | "company_staff" | "admin" | "system";

/**
 * Allowed status transitions. Key = current status, value = statuses it
 * can transition to. Empty array = terminal state.
 */
export const STATUS_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  draft: ["available", "removed"],
  available: [
    "application_pending",
    "under_offer",
    "rented",
    "sold",
    "unavailable",
    "suspended",
    "removed",
    "draft",
  ],
  application_pending: [
    "available",
    "under_offer",
    "rented",
    "sold",
    "unavailable",
    "suspended",
    "removed",
  ],
  under_offer: [
    "available",
    "application_pending",
    "rented",
    "sold",
    "unavailable",
    "suspended",
    "removed",
  ],
  rented: ["available", "unavailable", "suspended", "removed"],
  sold: ["available", "unavailable", "suspended", "removed"],
  unavailable: [
    "available",
    "draft",
    "application_pending",
    "under_offer",
    "rented",
    "sold",
    "suspended",
    "removed",
  ],
  suspended: [
    "available",
    "draft",
    "unavailable",
    "removed",
    "application_pending",
    "under_offer",
    "rented",
    "sold",
  ], // admin can restore from suspended
  removed: ["available", "draft", "suspended"], // restore requires admin
};

/**
 * Roles that can perform a given transition.
 *   - "owner" / "agent" / "company_staff" = the property's owner / managing
 *     agent / company staff (mutually authorised via RLS / capability)
 *   - "admin" = platform admins (verified via requireAdmin())
 *   - "system" = automated processes (cron jobs, system events)
 *
 * Owners can do most things. Admins can suspend / restore. Removed →
 * restore requires admin (per spec Section 23).
 */
export const TRANSITION_ACTORS: Record<
  PropertyStatus,
  Partial<Record<PropertyStatus, PropertyActor[]>>
> = {
  draft: {
    available: ["owner", "company_staff"],
    removed: ["owner", "company_staff", "admin"],
  },
  available: {
    application_pending: ["system"],
    under_offer: ["owner", "company_staff", "admin"],
    rented: ["owner", "company_staff", "admin"],
    sold: ["owner", "company_staff", "admin"],
    unavailable: ["owner", "company_staff", "admin"],
    suspended: ["admin"],
    removed: ["owner", "company_staff", "admin"],
    draft: ["owner", "company_staff", "admin"],
  },
  application_pending: {
    available: ["owner", "company_staff", "admin"],
    under_offer: ["owner", "company_staff", "admin"],
    rented: ["owner", "company_staff", "admin"],
    sold: ["owner", "company_staff", "admin"],
    unavailable: ["owner", "company_staff", "admin"],
    suspended: ["admin"],
    removed: ["owner", "company_staff", "admin"],
  },
  under_offer: {
    available: ["owner", "company_staff", "admin"],
    application_pending: ["owner", "company_staff", "admin"],
    rented: ["owner", "company_staff", "admin"],
    sold: ["owner", "company_staff", "admin"],
    unavailable: ["owner", "company_staff", "admin"],
    suspended: ["admin"],
    removed: ["owner", "company_staff", "admin"],
  },
  rented: {
    available: ["owner", "company_staff", "admin"],
    unavailable: ["owner", "company_staff", "admin"],
    suspended: ["admin"],
    removed: ["owner", "company_staff", "admin"],
  },
  sold: {
    available: ["owner", "company_staff", "admin"],
    unavailable: ["owner", "company_staff", "admin"],
    suspended: ["admin"],
    removed: ["owner", "company_staff", "admin"],
  },
  unavailable: {
    available: ["owner", "company_staff", "admin"],
    draft: ["owner", "company_staff", "admin"],
    application_pending: ["system"],
    under_offer: ["owner", "company_staff", "admin"],
    rented: ["owner", "company_staff", "admin"],
    sold: ["owner", "company_staff", "admin"],
    suspended: ["admin"],
    removed: ["owner", "company_staff", "admin"],
  },
  suspended: {
    available: ["admin"],
    draft: ["admin"],
    unavailable: ["admin"],
    removed: ["admin"],
    application_pending: ["admin"],
    under_offer: ["admin"],
    rented: ["admin"],
    sold: ["admin"],
  },
  removed: {
    available: ["admin"], // restoring from removed requires admin
    draft: ["admin"],
    suspended: ["admin"],
  },
};

/**
 * Returns true if a transition is allowed.
 * Use this in server actions to authorise status changes.
 */
export function canTransition(
  from: PropertyStatus,
  to: PropertyStatus,
  actor: PropertyActor,
): boolean {
  const allowedTargets = STATUS_TRANSITIONS[from] ?? [];
  if (!allowedTargets.includes(to)) return false;

  const allowedActors = TRANSITION_ACTORS[from]?.[to];
  if (!allowedActors) return false;
  return allowedActors.includes(actor);
}

/**
 * Returns the human-readable reason a transition is rejected.
 * Useful for error messages.
 */
export function explainTransition(
  from: PropertyStatus,
  to: PropertyStatus,
): string {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    return `Cannot transition from "${from}" to "${to}".`;
  }
  const allowedActors = TRANSITION_ACTORS[from]?.[to] ?? [];
  if (allowedActors.length === 0) {
    return `No actor is authorised to transition from "${from}" to "${to}".`;
  }
  return `Only ${allowedActors.join(", ")} can transition from "${from}" to "${to}".`;
}

/**
 * Public-facing statuses. Drafts, suspended, and removed listings are
 * NEVER visible publicly.
 */
export const PUBLICLY_VISIBLE_STATUSES: PropertyStatus[] = [
  "available",
  "application_pending",
  "under_offer",
  "rented",
  "sold",
];

export function isPubliclyVisible(status: PropertyStatus): boolean {
  return PUBLICLY_VISIBLE_STATUSES.includes(status);
}

/**
 * Returns true if a status indicates the property is "taken" (no longer
 * available for new applications).
 */
export function isTaken(status: PropertyStatus): boolean {
  return status === "rented" || status === "sold";
}
