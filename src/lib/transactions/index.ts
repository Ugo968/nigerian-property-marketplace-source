/**
 * Transactions module barrel.
 *
 * Single import surface for everything transaction-related:
 *   import { createInquiryAction, getTransaction, canTransition } from "@/lib/transactions";
 */

// State machine
export {
  TRANSACTION_TRANSITIONS,
  FORWARD_PATH,
  TRANSACTION_STATUS_LABELS,
  INSPECTION_TRANSITIONS,
  INSPECTION_STATUS_LABELS,
  OFFER_TRANSITIONS,
  OFFER_STATUS_LABELS,
  canTransition,
  canTransitionInspection,
  canTransitionOffer,
  isTerminalStatus,
  isActiveStatus,
  forwardPathIndex,
} from "./state-machine";

// Eligibility + authorization
export {
  loadPropertyContext,
  loadTransactionParties,
  canInitiateTransaction,
  canViewTransaction,
  canTransitionTransaction,
  canSubmitOffer,
  canAcceptOffer,
  canCompleteTransaction,
  canCancelTransaction,
} from "./eligibility";
export type {
  PropertyContext,
  TransactionParties,
  EligibilityResult,
} from "./eligibility";

// Server actions
export {
  createInquiryAction,
  scheduleInspectionAction,
  confirmInspectionAction,
  rescheduleInspectionAction,
  cancelInspectionAction,
  completeInspectionAction,
  submitOfferAction,
  acceptOfferAction,
  declineOfferAction,
  withdrawOfferAction,
  completeTransactionAction,
  cancelTransactionAction,
} from "./actions";
export type { TransactionActionResult } from "./actions";

// Fetchers
export {
  listMyTransactions,
  getTransaction,
  getTransactionParticipants,
  getTransactionStatusHistory,
  getTransactionInspections,
  getTransactionNegotiations,
  getTransactionOffers,
  getOfferHistory,
  getInspection,
} from "./fetchers";
export type { TransactionListFilters } from "./fetchers";
