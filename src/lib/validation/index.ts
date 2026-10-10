/**
 * Validation barrel.
 *
 * Schemas are exported as named exports so consumers can import only
 * what they need:
 *   import { signupSchema, loginSchema } from "@/lib/validation";
 *
 * Specific domain schemas (properties, applications, payments, etc.)
 * will be added in later prompts as the corresponding features are built.
 */

export * from "./auth";
export * from "./security";
