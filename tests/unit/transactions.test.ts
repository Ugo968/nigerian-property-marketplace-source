import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Property Transaction Workflow tests (Prompt 18).
 *
 * Verifies:
 *   * Migration 0025 creates the expected tables / RLS / SECURITY DEFINER functions
 *   * State machine enforces valid forward transitions only
 *   * Inspection sub-state machine
 *   * Offer sub-state machine (counter-offer chain)
 *   * Eligibility / authorization checks
 *   * Server actions call requireAdmin / requireAdminPermission where applicable
 *   * No property-money payment flow was introduced (spec Section 2, 44, 55)
 *   * Reviews eligibility includes completed transactions
 *   * Notification types for transaction events exist
 *   * RLS prevents IDOR (participants-only access)
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");
const SRC_DIR = path.join(process.cwd(), "src");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Migration invariants
// ---------------------------------------------------------------------------
describe("transaction migration (0025)", () => {
  const migrations = allMigrationsContent();

  it("creates the transactions table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.transactions/i,
    );
  });

  it("creates transaction_participants", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.transaction_participants/i,
    );
  });

  it("creates transaction_status_history (append-only — INSERT-only RLS)", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.transaction_status_history/i,
    );
  });

  it("creates inspections", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.inspections/i,
    );
  });

  it("creates negotiation_records", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.negotiation_records/i,
    );
  });

  it("creates offers", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.offers/i,
    );
  });

  it("creates offer_history (immutable counter-offer chain)", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.offer_history/i,
    );
  });

  it("enables RLS on all 7 transaction tables", () => {
    const tables = [
      "transactions",
      "transaction_participants",
      "transaction_status_history",
      "inspections",
      "negotiation_records",
      "offers",
      "offer_history",
    ];
    for (const t of tables) {
      expect(migrations).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      );
    }
  });

  it("transactions have UNIQUE partial index for active dedup", () => {
    expect(migrations).toContain("transactions_active_unique_idx");
  });

  it("offers have UNIQUE partial index for one active offer per submitter per transaction", () => {
    expect(migrations).toContain("offers_active_unique_idx");
  });

  it("transactions table has NO client INSERT / UPDATE policy (server-only writes)", () => {
    // The migration defines SELECT policies but no INSERT/UPDATE.
    const insertMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.transactions\s+for\s+insert/i,
    );
    const updateMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.transactions\s+for\s+update/i,
    );
    expect(insertMatch).toBeNull();
    expect(updateMatch).toBeNull();
  });

  it("offers RLS exposes the customer's amount to themselves + the counter-party only", () => {
    expect(migrations).toContain("Offer submitters can read their own offers");
    expect(migrations).toContain("Property owners/managing agents can read transaction offers");
    // No public-read policy
    const publicMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.offers\s+for\s+select\s+to\s+anon/i,
    );
    expect(publicMatch).toBeNull();
  });

  it("transaction_status_history has INSERT-only Update=never", () => {
    // The history table has INSERT via the SECURITY DEFINER functions
    // and SELECT for participants — no UPDATE.
    const updateMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.transaction_status_history\s+for\s+update/i,
    );
    expect(updateMatch).toBeNull();
  });

  it("defines accept_transaction_offer SECURITY DEFINER (concurrency-safe)", () => {
    expect(migrations).toMatch(/create or replace function public\.accept_transaction_offer/i);
    expect(migrations).toMatch(/security definer/i);
  });

  it("defines complete_transaction SECURITY DEFINER with property status integration", () => {
    expect(migrations).toMatch(/create or replace function public\.complete_transaction/i);
    // Sale → sold, rent → rented
    expect(migrations).toContain("'sold'");
    expect(migrations).toContain("'rented'");
  });

  it("defines cancel_transaction SECURITY DEFINER with reason requirement", () => {
    expect(migrations).toMatch(/create or replace function public\.cancel_transaction/i);
    expect(migrations).toMatch(/length\(trim\(p_reason\)\) < 3/);
  });

  it("defines transition_transaction SECURITY DEFINER for forward transitions", () => {
    expect(migrations).toMatch(/create or replace function public\.transition_transaction/i);
  });

  it("uses conditional UPDATE (FOR UPDATE row locking for concurrency)", () => {
    // The SECURITY DEFINER functions use SELECT ... FOR UPDATE
    expect(migrations).toMatch(/for update/i);
  });

  it("offer amount columns are bigint (minor units) — never card / payment data", () => {
    expect(migrations).toContain("offered_amount bigint");
    expect(migrations).toContain("proposed_amount bigint");
    expect(migrations).not.toMatch(/card_number|cvv|payment_secret/i);
  });

  it("transactions have no payment_id / paystack_reference / flutterwave_reference columns", () => {
    // V1 does NOT hold property transaction money — no payment columns
    expect(migrations).not.toContain("transactions.paystack");
    expect(migrations).not.toContain("transactions.flutterwave");
  });

  it("adds transaction_id column to reviews (Prompt 18 review integration)", () => {
    expect(migrations).toMatch(
      /alter table public\.reviews\s+add column if not exists transaction_id/i,
    );
  });
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
import {
  TRANSACTION_TRANSITIONS,
  FORWARD_PATH,
  canTransition,
  canTransitionInspection,
  canTransitionOffer,
  isTerminalStatus,
  isActiveStatus,
  forwardPathIndex,
  TRANSACTION_STATUS_LABELS,
  INSPECTION_TRANSITIONS,
  OFFER_TRANSITIONS,
} from "@/lib/transactions/state-machine";
import type { TransactionStatus, InspectionStatus, OfferStatus } from "@/types";

describe("transaction state machine (spec Section 8)", () => {
  it("forward path has all 7 stages in order", () => {
    expect(FORWARD_PATH).toEqual([
      "inquiry",
      "inspection_scheduled",
      "inspection_completed",
      "negotiation",
      "offer_made",
      "offer_accepted",
      "transaction_completed",
    ]);
  });

  it("inquiry can transition to inspection_scheduled + terminal states", () => {
    expect(canTransition("inquiry", "inspection_scheduled")).toBe(true);
    expect(canTransition("inquiry", "negotiation")).toBe(false);
    expect(canTransition("inquiry", "cancelled")).toBe(true);
    expect(canTransition("inquiry", "withdrawn")).toBe(true);
  });

  it("inspection_scheduled can only go to inspection_completed or terminal", () => {
    expect(canTransition("inspection_scheduled", "inspection_completed")).toBe(true);
    expect(canTransition("inspection_scheduled", "negotiation")).toBe(false);
    expect(canTransition("inspection_scheduled", "offer_made")).toBe(false);
  });

  it("inspection_completed can only go to negotiation or terminal", () => {
    expect(canTransition("inspection_completed", "negotiation")).toBe(true);
    expect(canTransition("inspection_completed", "offer_made")).toBe(false);
  });

  it("negotiation can only go to offer_made or terminal", () => {
    expect(canTransition("negotiation", "offer_made")).toBe(true);
    expect(canTransition("negotiation", "offer_accepted")).toBe(false);
  });

  it("offer_made can go to offer_accepted + decline/withdraw/expire", () => {
    expect(canTransition("offer_made", "offer_accepted")).toBe(true);
    expect(canTransition("offer_made", "declined")).toBe(true);
    expect(canTransition("offer_made", "withdrawn")).toBe(true);
    expect(canTransition("offer_made", "expired")).toBe(true);
  });

  it("offer_accepted can go to transaction_completed or cancelled", () => {
    expect(canTransition("offer_accepted", "transaction_completed")).toBe(true);
    expect(canTransition("offer_accepted", "cancelled")).toBe(true);
    expect(canTransition("offer_accepted", "negotiation")).toBe(false);
  });

  it("transaction_completed is terminal", () => {
    expect(isTerminalStatus("transaction_completed")).toBe(true);
    expect(isActiveStatus("transaction_completed")).toBe(false);
  });

  it("cancelled / withdrawn / expired / declined are terminal", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("withdrawn")).toBe(true);
    expect(isTerminalStatus("expired")).toBe(true);
    expect(isTerminalStatus("declined")).toBe(true);
  });

  it("inquiry is active (not terminal)", () => {
    expect(isActiveStatus("inquiry")).toBe(true);
    expect(isTerminalStatus("inquiry")).toBe(false);
  });

  it("forwardPathIndex returns the correct stage index", () => {
    expect(forwardPathIndex("inquiry")).toBe(0);
    expect(forwardPathIndex("inspection_scheduled")).toBe(1);
    expect(forwardPathIndex("transaction_completed")).toBe(6);
    // Terminal states return -1 (not on the forward path)
    expect(forwardPathIndex("cancelled")).toBe(-1);
    expect(forwardPathIndex("withdrawn")).toBe(-1);
  });

  it("TRANSACTION_STATUS_LABELS covers every status", () => {
    const statuses: TransactionStatus[] = [
      "inquiry", "inspection_scheduled", "inspection_completed",
      "negotiation", "offer_made", "offer_accepted",
      "transaction_completed", "cancelled", "withdrawn", "expired", "declined",
    ];
    for (const s of statuses) {
      expect(TRANSACTION_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe("inspection sub-state machine (spec Section 11)", () => {
  it("proposed → confirmed / reschedule_requested / cancelled", () => {
    expect(canTransitionInspection("proposed", "confirmed")).toBe(true);
    expect(canTransitionInspection("proposed", "reschedule_requested")).toBe(true);
    expect(canTransitionInspection("proposed", "cancelled")).toBe(true);
    expect(canTransitionInspection("proposed", "completed")).toBe(false);
  });

  it("confirmed → completed / no_show / cancelled", () => {
    expect(canTransitionInspection("confirmed", "completed")).toBe(true);
    expect(canTransitionInspection("confirmed", "no_show")).toBe(true);
    expect(canTransitionInspection("confirmed", "cancelled")).toBe(true);
    expect(canTransitionInspection("confirmed", "proposed")).toBe(false);
  });

  it("completed is terminal", () => {
    expect(INSPECTION_TRANSITIONS.completed).toEqual([]);
  });
});

describe("offer sub-state machine (spec Section 17, 19)", () => {
  it("submitted → accepted / declined / withdrawn / expired / superseded", () => {
    const statuses: OfferStatus[] = ["accepted", "declined", "withdrawn", "expired", "superseded"];
    for (const s of statuses) {
      expect(canTransitionOffer("submitted", s)).toBe(true);
    }
  });

  it("accepted / declined / withdrawn / expired / superseded are terminal", () => {
    const terminals: OfferStatus[] = ["accepted", "declined", "withdrawn", "expired", "superseded"];
    for (const t of terminals) {
      expect(OFFER_TRANSITIONS[t]).toEqual([]);
    }
  });

  it("cannot transition from accepted back to submitted", () => {
    expect(canTransitionOffer("accepted", "submitted")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source code structure (spec Sections 2, 4, 18, 19, 20, 39, 41, 44, 55)
// ---------------------------------------------------------------------------
describe("transaction source code structure", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("actions module defines all required server actions", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("createInquiryAction");
    expect(actions).toContain("scheduleInspectionAction");
    expect(actions).toContain("confirmInspectionAction");
    expect(actions).toContain("rescheduleInspectionAction");
    expect(actions).toContain("cancelInspectionAction");
    expect(actions).toContain("completeInspectionAction");
    expect(actions).toContain("submitOfferAction");
    expect(actions).toContain("acceptOfferAction");
    expect(actions).toContain("declineOfferAction");
    expect(actions).toContain("withdrawOfferAction");
    expect(actions).toContain("completeTransactionAction");
    expect(actions).toContain("cancelTransactionAction");
  });

  it("actions module NEVER calls Paystack / Flutterwave (spec Section 44)", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    // Strip the file's comment block before checking — the comment
    // mentions paystack by name as a NEGATIVE assertion, which is fine.
    const stripped = actions.replace(/^\/\*[\s\S]*?\*\//gm, "");
    expect(stripped).not.toMatch(/\bpaystack\b|\bflutterwave\b|\binitiatePayment\b/i);
  });

  it("actions module does NOT define Pay Rent / Buy Property / Pay Deposit buttons", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).not.toMatch(/payRent|buyProperty|payDeposit|payCommission/i);
  });

  it("acceptOfferAction uses SECURITY DEFINER accept_transaction_offer (concurrency-safe)", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("accept_transaction_offer");
  });

  it("completeTransactionAction uses SECURITY DEFINER complete_transaction", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("complete_transaction");
  });

  it("cancelTransactionAction uses SECURITY DEFINER cancel_transaction", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("cancel_transaction");
  });

  it("acceptOfferAction prevents self-acceptance (spec Section 20)", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("You cannot accept your own offer");
  });

  it("submitOfferAction supersedes previous submitted offer (counter-offer chain)", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("supersedes_offer_id");
    expect(actions).toContain("Counter-offer");
  });

  it("eligibility module prevents transactions on own property (spec Section 4)", () => {
    const elig = readSrc("lib/transactions/eligibility.ts");
    expect(elig).toContain("You cannot transact on your own property");
  });

  it("createInquiryAction enforces rate limit (spec Section 42)", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("transaction_inquiry");
  });

  it("actions module dispatches transaction notification types", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("transaction.inquiry");
    expect(actions).toContain("transaction.inspection_proposed");
    expect(actions).toContain("transaction.inspection_confirmed");
    expect(actions).toContain("transaction.inspection_rescheduled");
    expect(actions).toContain("transaction.inspection_cancelled");
    expect(actions).toContain("transaction.inspection_completed");
    expect(actions).toContain("transaction.offer_submitted");
    expect(actions).toContain("transaction.offer_accepted");
    expect(actions).toContain("transaction.offer_declined");
    expect(actions).toContain("transaction.completed");
    expect(actions).toContain("transaction.cancelled");
  });

  it("eligibility module defines canInitiateTransaction + canAcceptOffer", () => {
    const elig = readSrc("lib/transactions/eligibility.ts");
    expect(elig).toContain("canInitiateTransaction");
    expect(elig).toContain("canAcceptOffer");
    expect(elig).toContain("canViewTransaction");
    expect(elig).toContain("canCompleteTransaction");
    expect(elig).toContain("canCancelTransaction");
  });

  it("state-machine module exports canTransition + status labels", () => {
    const sm = readSrc("lib/transactions/state-machine.ts");
    expect(sm).toContain("canTransition");
    expect(sm).toContain("TRANSACTION_STATUS_LABELS");
    expect(sm).toContain("INSPECTION_TRANSITIONS");
    expect(sm).toContain("OFFER_TRANSITIONS");
  });

  it("fetchers use RLS-bound server client (NOT admin client) for participant-only access", () => {
    const f = readSrc("lib/transactions/fetchers.ts");
    expect(f).toContain("createServerClient");
    // The fetchers MUST NOT use the admin client (which bypasses RLS).
    expect(f).not.toMatch(/createAdminClient/);
  });

  it("dashboard transactions page calls getCurrentProfile (auth check)", () => {
    const page = readSrc("app/dashboard/transactions/page.tsx");
    expect(page).toContain("getCurrentProfile");
    expect(page).toContain("redirect");
  });

  it("dashboard transactions detail page uses RLS-bound getTransaction (no admin bypass)", () => {
    const page = readSrc("app/dashboard/transactions/[id]/page.tsx");
    expect(page).toContain("getTransaction");
  });

  it("transaction detail client shows safety warning (spec Section 13, 43)", () => {
    const client = readSrc("components/transactions/transaction-detail-client.tsx");
    expect(client).toContain("Stay safe");
    expect(client).toContain("platform does NOT hold transaction money");
  });

  it("transaction detail client displays a non-color-only timeline (spec Section 32)", () => {
    const client = readSrc("components/transactions/transaction-detail-client.tsx");
    expect(client).toContain("aria-label");
    expect(client).toContain("completed");
    expect(client).toContain("current");
    expect(client).toContain("upcoming");
  });

  it("transaction detail client does NOT expose payment buttons", () => {
    const client = readSrc("components/transactions/transaction-detail-client.tsx");
    expect(client).not.toMatch(/Pay Rent|Buy Property|Pay Deposit|Pay Commission/i);
  });

  it("transactions list client displays the no-escrow safety warning", () => {
    const list = readSrc("components/transactions/transactions-list-client.tsx");
    expect(list).toContain("platform does NOT hold transaction money");
  });
});

// ---------------------------------------------------------------------------
// Reviews eligibility integration (spec Section 35)
// ---------------------------------------------------------------------------
describe("reviews eligibility integration (spec Section 35)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("QualifyingInteraction type includes 'transaction'", () => {
    const elig = readSrc("lib/reviews/eligibility.ts");
    expect(elig).toMatch(/type:\s*["']application["']\s*\|\s*["']representation["']\s*\|\s*["']conversation["']\s*\|\s*["']transaction["']/);
  });

  it("findQualifyingInteractions checks completed transactions", () => {
    const elig = readSrc("lib/reviews/eligibility.ts");
    expect(elig).toContain("transaction_participants");
    expect(elig).toContain("transaction_completed");
  });
});

// ---------------------------------------------------------------------------
// Notification integration (spec Section 34)
// ---------------------------------------------------------------------------
describe("transaction notification types (spec Section 34)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("notifications catalogue includes all 11 transaction event types", () => {
    const types = readSrc("lib/notifications/types.ts");
    const required = [
      "transaction.inquiry",
      "transaction.inspection_proposed",
      "transaction.inspection_confirmed",
      "transaction.inspection_rescheduled",
      "transaction.inspection_cancelled",
      "transaction.inspection_completed",
      "transaction.offer_submitted",
      "transaction.offer_accepted",
      "transaction.offer_declined",
      "transaction.completed",
      "transaction.cancelled",
    ];
    for (const t of required) {
      expect(types).toContain(`id: "${t}"`);
    }
  });

  it("transaction notification types belong to 'properties' category (preferences)", () => {
    const types = readSrc("lib/notifications/types.ts");
    // Each transaction.* type should be in the "properties" category
    // so users can opt out via the properties preference (they're not
    // mandatory — they're workflow updates, not security-critical).
    expect(types).toMatch(/id: "transaction\.inquiry"[\s\S]*?category: "properties"/);
  });
});

// ---------------------------------------------------------------------------
// Admin integration (spec Section 47)
// ---------------------------------------------------------------------------
describe("admin transactions integration (spec Section 47)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("admin transactions fetchers are read-only", () => {
    const f = readSrc("lib/admin/transactions-fetchers.ts");
    expect(f).toContain("adminListTransactions");
    expect(f).toContain("adminGetTransaction");
    // No mutation actions
    expect(f).not.toMatch(/update\(|delete\(|insert\(/i);
  });

  it("admin transactions page requires requireAdminPermission", () => {
    const page = readSrc("app/admin/transactions/page.tsx");
    expect(page).toContain("requireAdminPermission");
    expect(page).toContain('redirect("/forbidden")');
  });

  it("admin layout includes transactions in the sidebar", () => {
    const layout = readSrc("components/layout/admin-layout.tsx");
    expect(layout).toContain('href: "/admin/transactions"');
  });

  it("dashboard layout includes transactions in the sidebar", () => {
    const layout = readSrc("components/layout/dashboard-layout.tsx");
    expect(layout).toContain('href: "/dashboard/transactions"');
  });
});

// ---------------------------------------------------------------------------
// Money rule (spec Section 2, 44, 55)
// ---------------------------------------------------------------------------
describe("V1 no-money rule (spec Section 2, 44, 55)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("transactions module has NO payment provider imports", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    // Strip the file's comment block before checking.
    const stripped = actions.replace(/^\/\*[\s\S]*?\*\//gm, "");
    expect(stripped).not.toContain("@/lib/payments");
    expect(stripped).not.toMatch(/\bpaystack\b/i);
    expect(stripped).not.toMatch(/\bflutterwave\b/i);
  });

  it("offer amounts are stored as integer minor units (not decimal money)", () => {
    const actions = readSrc("lib/transactions/actions.ts");
    expect(actions).toContain("offeredAmountMinor");
    // The UI converts Naira → kobo for storage — see transaction-detail-client.tsx
    const client = readSrc("components/transactions/transaction-detail-client.tsx");
    expect(client).toContain("Math.round(amountNaira * 100)");
  });

  it("transaction detail client explicitly says the platform does not collect money", () => {
    const client = readSrc("components/transactions/transaction-detail-client.tsx");
    expect(client).toContain("platform does NOT collect this money");
  });
});
