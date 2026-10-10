# TRANSACTIONS

This document records the Property Transaction Workflow system
implemented in Prompt 18.

## CRITICAL MONEY RULE (spec Section 2, 44, 55)

V1 does NOT hold or transfer property transaction money.

The transaction workflow tracks the deal journey:

```
Inquiry → Inspection Scheduled → Inspection Completed
       → Negotiation → Offer Made → Offer Accepted
       → Transaction Completed
```

The platform facilitates:
- discovery
- communication (via Prompt 10 messaging)
- inspection scheduling
- negotiation records
- formal offers
- transaction / deal tracking
- reviews (after completion)
- notifications

The platform does NOT facilitate:
- escrow
- rent collection
- purchase-money collection
- property deposits
- commission payments
- agent commission transfers
- property transaction wallets

Existing Paystack / Flutterwave infrastructure (Prompt 13) remains for
PLATFORM payments only: subscriptions, featured listings, advertising.

There are NO "Pay Rent", "Buy Property", "Pay Deposit", or
"Pay Commission" buttons anywhere in this codebase. The offered
amounts in the negotiation / offer tables are TRACKED for negotiation
purposes only — they are stored as integer minor units (kobo) and
the platform never collects them.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Property detail page                                              │
│  - "Start transaction" button (visible only to non-owners)         │
└────────────────────────────┬────────────────────────────────────────┘
                             │ calls
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Transaction server actions (src/lib/transactions/actions.ts)     │
│  - Every action resolves caller from session                      │
│  - Validates eligibility via eligibility module                   │
│  - Calls SECURITY DEFINER functions for atomic transitions        │
│  - Records history (status_history + offer_history — append-only) │
│  - Dispatches notifications to participants                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┴───────────────────────┐
        ▼                                           ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│  State machine          │               │  Eligibility            │
│  (state-machine.ts)     │               │  (eligibility.ts)       │
│  - TRANSACTION_TRANSITIONS│             │  - canInitiateTransaction│
│  - INSPECTION_TRANSITIONS│              │  - canViewTransaction    │
│  - OFFER_TRANSITIONS     │              │  - canAcceptOffer       │
│  - canTransition         │               │  - canCompleteTransaction│
│  - isTerminalStatus      │               │  - canCancelTransaction │
└─────────────────────────┘               └─────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Database SECURITY DEFINER functions (migration 0025)              │
│  - accept_transaction_offer (atomic, race-safe, supersedes others) │
│  - complete_transaction (updates property status: rent→rented,    │
│    sale→sold)                                                       │
│  - cancel_transaction (requires reason; expires pending offers)    │
│  - transition_transaction (forward-only state machine)             │
│  All use SELECT ... FOR UPDATE + conditional UPDATE for concurrency│
└─────────────────────────────────────────────────────────────────────┘
```

## Database schema (migration 0025)

### 7 new tables

| Table                        | Purpose                                         |
|------------------------------|--------------------------------------------------|
| `transactions`               | Primary deal entity (status, parties, completion)|
| `transaction_participants`   | Multi-party involvement tracking                |
| `transaction_status_history` | Append-only state transition log               |
| `inspections`                | Separate inspection scheduling sub-state machine|
| `negotiation_records`        | Proposed prices / terms (not payment)           |
| `offers`                     | Formal offer entity                              |
| `offer_history`              | Immutable counter-offer chain                    |

Plus: `reviews.transaction_id` column added (allows completed
transactions to qualify reviews).

### Idempotency + deduplication

- `transactions` UNIQUE partial index on
  `(property_id, customer_id, transaction_type)` WHERE status NOT IN
  terminal — prevents duplicate active transactions for the same
  (property, customer, type)
- `offers` UNIQUE partial index on `(transaction_id, submitted_by)`
  WHERE status='submitted' — only one active offer per submitter per
  transaction at a time
- SECURITY DEFINER functions use `UPDATE ... WHERE` clauses with
  the previous state as a guard — repeated requests are no-ops

### Concurrency (spec Section 39)

- `accept_transaction_offer()` uses `SELECT ... FOR UPDATE` on the
  transaction row + conditional `UPDATE ... WHERE status='submitted'`
- Concurrent acceptance attempts: only one wins, the others return
  FALSE without mutating state
- `complete_transaction()` similar — only the first completion
  succeeds; subsequent calls return FALSE
- `cancel_transaction()` similar — only the first cancellation
  succeeds

## State machine (spec Section 8)

```
inquiry ──→ inspection_scheduled ──→ inspection_completed
                                                │
                                                ▼
                                         negotiation ──→ offer_made
                                                              │
                                                              ▼
                                                         offer_accepted
                                                              │
                                                              ▼
                                                     transaction_completed

Terminal states: cancelled, withdrawn, expired, declined
```

The state machine is enforced at three layers:
1. **Database** — SECURITY DEFINER functions check valid transitions
2. **Application** — `canTransition()` in `state-machine.ts` validates
   before calling the RPC (early rejection with clear error message)
3. **Action signature** — Each transition has its own function
   (`scheduleInspectionAction`, `completeInspectionAction`, etc.)
   rather than a generic `setTransactionStatus` function

### Inspection sub-state machine

```
proposed ──→ confirmed ──→ completed
   │           │
   │           ├──→ no_show
   │           └──→ cancelled
   ├──→ reschedule_requested ──→ proposed (cycle)
   └──→ cancelled

Terminal: completed, cancelled, no_show
```

### Offer sub-state machine

```
draft ──→ submitted ──→ accepted (immutable)
              │           accepted is terminal
              ├──→ declined
              ├──→ withdrawn
              ├──→ expired (server-side time evaluation)
              └──→ superseded (counter-offer chain)
```

Counter-offers (spec Section 19): when a customer submits a new offer
while their previous one is still 'submitted', the previous offer is
marked 'superseded' (NOT deleted) and the new offer's
`supersedes_offer_id` points back to it. The full chain is preserved
in `offer_history`.

## Authorization (spec Section 4, 24, 25, 26, 27, 28, 29)

The `eligibility.ts` module resolves WHO can do WHAT:

| Action                       | Authorized parties                              |
|------------------------------|--------------------------------------------------|
| Initiate transaction          | Authenticated active user (not the property owner/creator/agent) |
| View transaction             | Customer, owner, managing agent, managing company, listing creator |
| Schedule inspection          | Any active participant                          |
| Confirm inspection           | The OTHER party (not the proposer)              |
| Reschedule / cancel inspection | Any active participant                        |
| Mark inspection completed    | Any active participant (when status='confirmed') |
| Submit offer / counter-offer | Any active participant                          |
| Accept offer                 | Owner / managing agent / managing company ONLY |
| Decline offer                | Owner / managing agent / managing company      |
| Withdraw own offer           | The offer submitter                             |
| Complete transaction         | Owner / agent / company / customer (user-reported, not platform-verified) |
| Cancel transaction           | Any active participant (requires reason)        |

**Self-acceptance prevention** (spec Section 18): the customer CANNOT
accept their own offer. The action checks `offer.submitted_by !== profile.id`
AND the SECURITY DEFINER function re-checks authorization at the DB
layer (the caller must match the transaction's `owner_id` /
`managing_agent_id` / `managing_company_id`).

## RLS (spec Section 46)

| Table                        | Policy                                           |
|------------------------------|--------------------------------------------------|
| `transactions`               | Participants-only SELECT; server-only writes     |
| `transaction_participants`  | Co-participants can read; server-only writes     |
| `transaction_status_history`| Participants can read; INSERT-only via service role |
| `inspections`               | Participants can read; server-only writes        |
| `negotiation_records`       | Participants can read; server-only writes        |
| `offers`                    | Submitter + counter-party (owner/agent) only     |
| `offer_history`              | Submitter + counter-party only                   |

**Offer amount privacy (spec Section 23)**: RLS exposes offer
amounts ONLY to:
- The offer submitter (their own offers)
- The property owner / managing agent / managing company (the
  counter-party)

Other customers' offers on the same transaction are NOT visible —
RLS filters them out at the row level.

**IDOR prevention (spec Section 41)**: An unrelated user cannot
access a transaction simply by guessing its UUID. RLS narrows
every SELECT to transactions where the caller is a participant.

## Notification integration (spec Section 34)

11 new notification types added to the catalogue:

- `transaction.inquiry`
- `transaction.inspection_proposed`
- `transaction.inspection_confirmed`
- `transaction.inspection_rescheduled`
- `transaction.inspection_cancelled`
- `transaction.inspection_completed`
- `transaction.offer_submitted`
- `transaction.offer_accepted`
- `transaction.offer_declined`
- `transaction.completed`
- `transaction.cancelled`

All belong to the `properties` category (users can opt out via
preferences — they're workflow updates, not security-critical).
The dispatcher sends them idempotently via `eventKey`.

## Reviews integration (spec Section 35)

The `findQualifyingInteractions()` function in
`src/lib/reviews/eligibility.ts` now includes a 4th qualifying
interaction type: `"transaction"`. A completed transaction is one
of the STRONGEST qualifying interaction contexts — the reviewer +
reviewee actually transacted.

The function checks:
1. The reviewer has a `transaction_completed` transaction they
   participated in (as customer / owner / managing agent)
2. The reviewee is also a participant in the same transaction

When a review is created with a qualifying `transaction` interaction,
the review row's `transaction_id` column is set (added by migration
0025 to the existing `reviews` table).

## Property status integration (spec Section 22)

`complete_transaction()` SECURITY DEFINER updates the property's
status when a transaction completes:

- `sale` → property status becomes `sold`
- `rent` → property status becomes `rented`
- `shortlet` → NO permanent status change (short-let properties stay
  available for the next customer)

The status update is conditional — it only happens if the property
is in an eligible status (`available`, `under_offer`,
`application_pending`). This avoids conflicts with admin moderation
(suspend / remove) that may have happened in parallel.

## Admin integration (spec Section 47)

`/admin/transactions` and `/admin/transactions/[id]` provide
read-only visibility:

- Admins with `applications.view` permission can list transactions
- Admins can view transaction detail (status history, inspections, offers)
- The detail page explicitly states: "Admins must NOT silently modify
  transaction history. High-impact admin intervention is audit-logged."

There is NO admin mutation path for transactions — admins use the
same `cancelTransactionAction` server action (with audit logging
via `recordAdminAction` from Prompt 17) if they need to cancel a
transaction on behalf of a user.

## Safety (spec Section 13, 43)

The transaction detail page and the transactions list page both
display the existing safety warning:

> Stay safe: Always inspect the property in person and independently
> verify the owner/agent, ownership documents, property details,
> and payment information before making any payment or commitment.
> The platform does NOT hold transaction money in V1.

The platform NEVER implies:
- "This transaction is guaranteed."
- "Your payment is protected by the platform."

because V1 has no escrow.

## Analytics (spec Section 48)

`getTransactionMetrics()` in `src/lib/admin/transactions-fetchers.ts`
returns basic operational metrics:

- Total transactions
- Active / completed / cancelled / withdrawn counts
- Inquiries today / 7-day
- Accepted offers
- Completed rentals / sales / shortlets

The admin overview page (Prompt 17) shows these in the moderation
queue section.

**Important**: completion is user-reported in V1 — the metrics do NOT
represent verified financial transactions.

## Accessibility (spec Section 50)

- Status timeline uses `aria-label` with `(completed)` /
  `(current)` / `(upcoming)` annotations — non-color-only communication
- `aria-current="step"` on the current stage
- Form inputs have associated `<label>` elements
- Cancel / decline dialogs use the existing `ConfirmDialog` with
  reason input + loading state + destructive style
- Mobile: tables transform into stacked cards; touch targets are
  ≥44px

## Mobile UX (spec Section 51)

- Status timeline is vertical (works on narrow screens)
- Inspection cards stack
- Offer cards stack with amount + status visible at a glance
- Action buttons wrap responsively
- ConfirmDialog uses AlertDialog which is mobile-friendly

## Routes added

| Route                                          | Purpose                                |
|------------------------------------------------|-----------------------------------------|
| `/dashboard/transactions`                       | List "my" transactions                 |
| `/dashboard/transactions/[id]`                 | Transaction detail with timeline + actions |
| `/admin/transactions`                          | Admin read-only list                   |
| `/admin/transactions/[id]`                    | Admin read-only detail                 |

## Known limitations (V1)

- No escrow / rent collection / purchase-money handling (spec 44, 54)
- No commission payments / agent payout system (spec 54)
- No mortgage processing / legal document signing / e-signatures (spec 54)
- No title transfer / government registry integration (spec 54)
- No SMS / push notifications (spec 54)
- No advanced transaction fraud detection (spec 54)
- Transaction completion is user-reported (not platform-verified)
- The conversation integration is wired at the data level
  (`transactions.conversation_id`) but the system-message posting
  on workflow events is a future enhancement — currently only
  notifications are dispatched
- Offer expiry is evaluated on read (server-side time check), not
  via a background cron worker that proactively marks offers expired
