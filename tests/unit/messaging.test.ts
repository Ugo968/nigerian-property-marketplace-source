import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { capabilitiesFor } from "@/lib/capabilities";

/**
 * Messaging infrastructure tests.
 *
 * Per spec Sections 10, 26, 27, 28, 29, 34, 35, 37, 42:
 *   * New-conversation monthly limits enforced via capability system
 *   * Existing conversations never blocked when limit reached
 *   * Verification restrictions enforced server-side
 *   * sender_id derived from server session
 *   * RLS: participants only
 *   * Audit events for conversation/message lifecycle
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("messaging capability limits (spec Section 27)", () => {
  it("agent Free: 10 new conversations/month", () => {
    expect(capabilitiesFor("agent", "free").maxNewConversationsPerMonth).toBe(10);
  });

  it("agent Pro: 25 new conversations/month", () => {
    expect(capabilitiesFor("agent", "pro").maxNewConversationsPerMonth).toBe(25);
  });

  it("agent Premium: unlimited (fair-use ceiling)", () => {
    expect(capabilitiesFor("agent", "premium").maxNewConversationsPerMonth).toBeGreaterThan(100);
  });

  it("company Free: 15 new conversations/month", () => {
    expect(capabilitiesFor("company", "free").maxNewConversationsPerMonth).toBe(15);
  });

  it("company Pro: 25 new conversations/month", () => {
    expect(capabilitiesFor("company", "pro").maxNewConversationsPerMonth).toBe(25);
  });

  it("company Premium: unlimited (fair-use ceiling)", () => {
    expect(capabilitiesFor("company", "premium").maxNewConversationsPerMonth).toBeGreaterThan(100);
  });

  it("landlord plans: no new-conversation limit (receive inquiries)", () => {
    expect(capabilitiesFor("landlord", "free").maxNewConversationsPerMonth).toBeNull();
    expect(capabilitiesFor("landlord", "pro").maxNewConversationsPerMonth).toBeNull();
    expect(capabilitiesFor("landlord", "premium").maxNewConversationsPerMonth).toBeGreaterThan(100);
  });
});

describe("messaging tables exist with correct schema (spec Section 4, 5, 6)", () => {
  const content = allMigrationsContent();

  it("conversations table has property_id + application_id + conversation_type", () => {
    expect(content).toMatch(/create\s+table.*conversations[\s\S]*?property_id\s+uuid/i);
    expect(content).toMatch(/create\s+table.*conversations[\s\S]*?application_id\s+uuid/i);
    expect(content).toMatch(/create\s+table.*conversations[\s\S]*?conversation_type\s+text/i);
    expect(content).toMatch(/conversation_type\s+in\s*\(\s*'marketplace',?\s*'application',?\s*'support'\s*\)/i);
  });

  it("conversation_participants has unread_count + archived_at + muted", () => {
    expect(content).toMatch(/conversation_participants[\s\S]*?unread_count/i);
    expect(content).toMatch(/conversation_participants[\s\S]*?archived_at/i);
    expect(content).toMatch(/conversation_participants[\s\S]*?muted/i);
    expect(content).toMatch(/conversation_participants[\s\S]*?last_read_message_id/i);
  });

  it("messages has message_type + deleted_at + edited_at", () => {
    expect(content).toMatch(/create\s+table.*messages[\s\S]*?message_type\s+text/i);
    expect(content).toMatch(/create\s+table.*messages[\s\S]*?deleted_at\s+timestamptz/i);
    expect(content).toMatch(/create\s+table.*messages[\s\S]*?edited_at\s+timestamptz/i);
  });

  it("messages supports text + system types (not arbitrary)", () => {
    expect(content).toMatch(/message_type\s+text\s+not\s+null\s+default\s+'text'/i);
    expect(content).toMatch(/message_type\s+in\s*\(\s*'text',?\s*'image',?\s*'file',?\s*'system',?\s*'property_share'\s*\)/i);
  });

  it("conversation_blocks table exists for blocking", () => {
    expect(content).toMatch(/create\s+table.*conversation_blocks/i);
    expect(content).toMatch(/conversation_blocks[\s\S]*?blocker_id/i);
    expect(content).toMatch(/conversation_blocks[\s\S]*?blocked_id/i);
    expect(content).toMatch(/conversation_blocks[\s\S]*?unique\s*\(\s*blocker_id,?\s*blocked_id\s*\)/i);
  });
});

describe("messaging RLS (spec Section 35)", () => {
  const content = allMigrationsContent();

  it("conversations has RLS enabled", () => {
    expect(content).toMatch(/alter\s+table\s+public\.conversations\s+enable\s+row\s+level\s+security/i);
  });

  it("only participants can read conversations", () => {
    expect(content).toMatch(/Participants\s+can\s+read\s+their\s+conversations/i);
  });

  it("only participants can update conversations", () => {
    expect(content).toMatch(/Participants\s+can\s+update\s+conversations/i);
  });

  it("messages has RLS — only participants can read", () => {
    expect(content).toMatch(/alter\s+table\s+public\.messages\s+enable\s+row\s+level\s+security/i);
    expect(content).toMatch(/Participants\s+can\s+read\s+messages\s+in\s+their\s+conversations/i);
  });

  it("only participants can send messages (sender_id verified)", () => {
    expect(content).toMatch(/Participants\s+can\s+send\s+messages/i);
    // The RLS policy must verify sender_id matches auth user via participant check
    expect(content).toMatch(/sender_id\s+in\s*\(select\s+id\s+from\s+public\.profiles\s+where\s+user_id\s*=\s*auth\.uid\(\)\)/i);
  });

  it("conversation_participants RLS — only own participant info visible", () => {
    expect(content).toMatch(/alter\s+table\s+public\.conversation_participants\s+enable\s+row\s+level\s+security/i);
    expect(content).toMatch(/Users\s+can\s+read\s+their\s+own\s+conversation_participants/i);
  });

  it("conversation_blocks RLS — users manage own blocks", () => {
    expect(content).toMatch(/alter\s+table\s+public\.conversation_blocks\s+enable\s+row\s+level\s+security/i);
    expect(content).toMatch(/Users\s+can\s+manage\s+their\s+own\s+blocks/i);
  });
});

describe("messaging server actions security (spec Section 34)", () => {
  it("createOrReuseConversation derives identity from server session", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/getCurrentUser\(\)/);
    expect(source).toMatch(/getCurrentProfile\(\)/);
    // Should NOT accept a client-supplied userId
    expect(source).not.toMatch(/export\s+async\s+function\s+createOrReuseConversation\s*\(\s*input\s*:\s*\{[^}]*userId/i);
  });

  it("sendMessageAction derives sender_id from server session, not client", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+async\s+function\s+sendMessageAction/);
    // The function signature takes conversationId + body, NOT senderId
    expect(source).not.toMatch(/senderId/i);
    // The INSERT must use profile.id as sender_id (server-derived)
    expect(source).toMatch(/sender_id:\s*profile\.id/);
  });

  it("sendMessageAction verifies the caller is a participant", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/conversation_participants/);
    expect(source).toMatch(/\.eq\("user_id",\s*profile\.id\)/);
  });

  it("message body is sanitised (HTML escaped)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/\.replace\(\/&\/g,\s*"&amp;"\)/);
    expect(source).toMatch(/\.replace\(\/<\/g,\s*"&lt;"\)/);
    expect(source).toMatch(/\.replace\(\/>\/g,\s*"&gt;"\)/);
  });

  it("message length enforced server-side (5000 chars)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/MAX_MESSAGE_LENGTH/);
    const constantsSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/constants.ts"),
      "utf8",
    );
    expect(constantsSource).toMatch(/MAX_MESSAGE_LENGTH\s*=\s*5000/);
  });

  it("account status enforced — suspended/banned cannot send", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/account_status\s*!==\s*"active"/);
  });

  it("conversation creation has monthly limit check", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/maxNewConversationsPerMonth/);
    expect(source).toMatch(/limitReached:\s*true/);
  });

  it("conversation creation includes duplicate prevention", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/existing/i);
    expect(source).toMatch(/reuse/i);
  });

  it("verification restriction enforced server-side", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/verification_state\s*===\s*"bronze"\s*\|\|\s*recipient\.verification_state\s*===\s*"blue"/i);
  });

  it("audit events recorded for conversation + message lifecycle", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/conversation\.create/);
    expect(source).toMatch(/message\.soft_delete/);
    expect(source).toMatch(/conversation\.block/);
  });

  it("soft deletion used (not hard delete) for messages", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/deleted_at/);
    expect(source).not.toMatch(/\.delete\(\).*messages/i);
  });
});

describe("messaging fetchers security (spec Section 34, 35)", () => {
  it("getInbox derives user identity from server session", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/fetchers.ts"),
      "utf8",
    );
    expect(source).toMatch(/getCurrentProfile\(\)/);
    expect(source).toMatch(/\.eq\("user_id",\s*profile\.id\)/);
  });

  it("getConversation verifies participation before returning", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/fetchers.ts"),
      "utf8",
    );
    expect(source).toMatch(/conversation_participants/);
    expect(source).toMatch(/if\s*\(!participant\)\s*return\s*null/i);
  });

  it("getOlderMessages verifies participation", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/messaging/fetchers.ts"),
      "utf8",
    );
    expect(source).toMatch(/getOlderMessages/);
    expect(source).toMatch(/conversation_participants/);
    expect(source).toMatch(/if\s*\(!participant\)\s*return\s*null/i);
  });
});

describe("messaging indexes for performance (spec Section 38)", () => {
  const content = allMigrationsContent();

  it("has index on conversation_participants(user_id)", () => {
    expect(content).toMatch(/conversation_participants_user_idx/i);
  });

  it("has index on conversations(last_message_at)", () => {
    expect(content).toMatch(/conversations_last_message_idx/i);
  });

  it("has index on messages(conversation_id, created_at)", () => {
    expect(content).toMatch(/messages_conversation_idx/i);
  });
});
