/**
 * Email provider abstraction.
 *
 * Concrete provider (Resend / SendGrid / Postmark / SMTP) is selected via
 * env var. Foundation phase ships the interface only — the next prompt
 * wires up the chosen provider's API calls.
 */

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  /** Plain text body. */
  text: string;
  /** HTML body. Optional — falls back to text if absent. */
  html?: string;
  /** Optional reply-to address. */
  replyTo?: string;
  /** Tags for analytics / filtering. */
  tags?: string[];
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageId: string | null }>;
}

class StubEmailProvider implements EmailProvider {
  readonly name = "stub";

  async send(message: EmailMessage): Promise<{ messageId: string | null }> {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[stub-email] to=${message.to} subject="${message.subject}"`,
      );
    }
    return { messageId: null };
  }
}

/**
 * Singleton. Replace with concrete provider in the notifications prompt.
 */
export const emailProvider: EmailProvider = new StubEmailProvider();
