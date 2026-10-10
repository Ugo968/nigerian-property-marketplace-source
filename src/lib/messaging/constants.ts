/**
 * Messaging constants — shared between client + server.
 * Cannot live in a "use server" file (which only exports async functions).
 */

export const MAX_MESSAGE_LENGTH = 5000;
export const MESSAGE_PAGE_SIZE = 30;
