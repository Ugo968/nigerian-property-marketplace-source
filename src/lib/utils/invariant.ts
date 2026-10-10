/**
 * Tiny invariant helper — throws if a condition is false.
 * Used for runtime assertions across server and client.
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
