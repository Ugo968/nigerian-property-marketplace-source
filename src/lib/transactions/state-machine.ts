/**
 * Transaction workflow state machine (spec Section 8).
 *
 * Forward path:
 *   inquiry → inspection_scheduled → inspection_completed
 *          → negotiation → offer_made → offer_accepted
 *          → transaction_completed
 *
 * Terminal states:
 *   cancelled / withdrawn / expired / declined
 *
 * The state machine is enforced at THREE layers:
 *   1. The `transition_transaction()` SECURITY DEFINER function
 *      (database layer — conditional UPDATE prevents race conditions)
 *   2. This TypeScript module (application layer — for early validation
 *      and clear error messages before hitting the DB)
 *   3. The server actions (call-site layer — the action calls
 *      `canTransition()` before invoking the RPC)
 *
 * Per spec Section 41 (security): NEVER trust client-submitted status
 * strings. The actions module takes a discrete function signature per
 * transition, not a status string.
 */

import type { TransactionStatus } from "@/types";

/**
 * Allowed forward transitions. Key = current status, value = the
 * statuses it can transition to (excluding terminal states which are
 * handled by cancel_transaction / offer lifecycle separately).
 */
export const TRANSACTION_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  inquiry: ["inspection_scheduled", "cancelled", "withdrawn", "declined", "expired"],
  inspection_scheduled: [
    "inspection_completed",
    "cancelled",
    "withdrawn",
    "expired",
  ],
  inspection_completed: ["negotiation", "cancelled", "withdrawn", "expired"],
  negotiation: ["offer_made", "cancelled", "withdrawn", "expired"],
  offer_made: [
    "offer_accepted",
    "cancelled",
    "withdrawn",
    "expired",
    "declined",
  ],
  offer_accepted: ["transaction_completed", "cancelled"],
  transaction_completed: [],
  cancelled: [],
  withdrawn: [],
  expired: [],
  declined: [],
};

/**
 * Returns true if the transition is allowed.
 */
export function canTransition(
  from: TransactionStatus,
  to: TransactionStatus,
): boolean {
  const allowed = TRANSACTION_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

/**
 * Returns true if the status is terminal (no further transitions).
 */
export function isTerminalStatus(status: TransactionStatus): boolean {
  return TRANSACTION_TRANSITIONS[status].length === 0;
}

/**
 * Returns true if the status represents an active deal (not terminal,
 * not completed).
 */
export function isActiveStatus(status: TransactionStatus): boolean {
  return (
    status !== "transaction_completed" &&
    !isTerminalStatus(status)
  );
}

/**
 * Ordered list of forward-path statuses for timeline rendering
 * (spec Section 32). The customer-facing timeline shows this sequence
 * with completed/current/upcoming indicators.
 */
export const FORWARD_PATH: TransactionStatus[] = [
  "inquiry",
  "inspection_scheduled",
  "inspection_completed",
  "negotiation",
  "offer_made",
  "offer_accepted",
  "transaction_completed",
];

/**
 * Human-readable labels for statuses (spec Section 32 — non-color
 * communication of status).
 */
export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  inquiry: "Inquiry",
  inspection_scheduled: "Inspection Scheduled",
  inspection_completed: "Inspection Completed",
  negotiation: "Negotiation",
  offer_made: "Offer Made",
  offer_accepted: "Offer Accepted",
  transaction_completed: "Transaction Completed",
  cancelled: "Cancelled",
  withdrawn: "Withdrawn",
  expired: "Expired",
  declined: "Declined",
};

/**
 * Returns the index of a status in the forward path. Used by the
 * timeline component to mark completed/current/upcoming stages.
 * Terminal states (cancelled/withdrawn/etc) return -1 — the timeline
 * shows them as a separate "Ended" indicator.
 */
export function forwardPathIndex(status: TransactionStatus): number {
  return FORWARD_PATH.indexOf(status);
}

// ---------------------------------------------------------------------------
// Inspection sub-state machine (spec Section 11).
// ---------------------------------------------------------------------------

import type { InspectionStatus } from "@/types";

export const INSPECTION_TRANSITIONS: Record<InspectionStatus, InspectionStatus[]> = {
  proposed: ["confirmed", "reschedule_requested", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  reschedule_requested: ["proposed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionInspection(
  from: InspectionStatus,
  to: InspectionStatus,
): boolean {
  const allowed = INSPECTION_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
  reschedule_requested: "Reschedule Requested",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

// ---------------------------------------------------------------------------
// Offer sub-state machine (spec Section 17, 19).
// ---------------------------------------------------------------------------

import type { OfferStatus } from "@/types";

export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["accepted", "declined", "withdrawn", "expired", "superseded"],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: [],
  superseded: [],
};

export function canTransitionOffer(
  from: OfferStatus,
  to: OfferStatus,
): boolean {
  const allowed = OFFER_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
  superseded: "Superseded",
};
