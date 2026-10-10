/**
 * Central type barrel. Import all shared domain types and DB row types
 * from "@/types".
 *
 * Two flavours of types live here:
 *   1. Domain types   — conceptual (UserRole, SubscriptionTier, etc.)
 *   2. Database types — DB row shapes (ProfileRow, PropertyRow, etc.)
 *
 * Domain types drive business rules. Database types drive query typing.
 */

// Domain types — conceptual, side-effect-free.
export * from "./domain";

// Database row types — mirror the live Postgres schema.
// In production, regenerate from `supabase gen types typescript` and
// replace the manual definitions in database.ts.
export * from "./database";
