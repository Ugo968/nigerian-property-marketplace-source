/**
 * Email template renderer (spec Section 10).
 *
 * Each template is a pure function (props) => { subject, text, html }.
 * No provider-specific markup. Output is sanitised, mobile-friendly,
 * and matches the Shelty brand (clean, professional, no excessive
 * graphics).
 *
 * CRITICAL — XSS defences (spec Section 38):
 *   - Every variable that contains user-generated text (property title,
 *     review body, message preview, advertiser headline, etc.) is
 *     HTML-escaped before interpolation. NEVER use dangerouslySetInnerHTML
 *     on user content.
 *   - URLs in CTAs are restricted to relative paths or our app origin.
 *     Absolute URLs to third parties are forbidden in the rendered output.
 *
 * The renderer returns plain strings — no JSX. This makes it server-only
 * safe (no React server component overhead) and easy to unit-test.
 */

import { serverConfig } from "@/lib/security/server-config";
import type { EmailTemplateSlug } from "./types";

// ---------------------------------------------------------------------------
// Public contract.
// ---------------------------------------------------------------------------
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateContext {
  /** Recipient's first name (preferred over full name for greetings). */
  recipientName: string;
  /** Recipient's email — used for the unsubscribe link, NOT displayed. */
  recipientEmail: string;
  /** Category group the template belongs to (controls unsubscribe visibility). */
  category: string;
  /** Whether the recipient's category is mandatory (no unsubscribe link). */
  isMandatory: boolean;
  /** A CTA action URL — relative path or absolute on our origin. */
  actionUrl?: string;
  /** Action label. */
  actionLabel?: string;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns an absolute URL on our origin for a relative path.
 * Rejects anything that's not a same-origin relative path. Used for CTAs.
 */
function safeUrl(path: string | undefined, fallback = "/dashboard"): string {
  if (!path) return `${serverConfig.appUrl}${fallback}`;
  // Must start with a single "/" and not "//"
  if (!path.startsWith("/") || path.startsWith("//")) {
    return `${serverConfig.appUrl}${fallback}`;
  }
  return `${serverConfig.appUrl}${path}`;
}

function buildUnsubscribeUrl(recipientEmail: string, category: string): string {
  // The unsubscribe endpoint expects email + category as query params and
  // resolves the profile server-side via the email lookup. The token-based
  // version (signed JWT) is a future enhancement.
  const params = new URLSearchParams({
    email: recipientEmail,
    category,
  });
  return `${serverConfig.appUrl}/api/notifications/unsubscribe?${params.toString()}`;
}

function buildPreferencesUrl(): string {
  return `${serverConfig.appUrl}/dashboard/notifications?tab=preferences`;
}

// ---------------------------------------------------------------------------
// Base layout — applied to all templates.
// ---------------------------------------------------------------------------
function wrap({
  subject,
  preheader,
  bodyHtml,
  context,
}: {
  subject: string;
  preheader: string;
  bodyHtml: string;
  context: TemplateContext;
}): EmailContent {
  const brand = "Shelty";
  const year = new Date().getFullYear();

  // Unsubscribe link is shown ONLY for non-mandatory categories.
  const unsubscribeBlock = context.isMandatory
    ? ""
    : `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
        <p>You received this email because of your Shelty notification preferences.</p>
        <p><a href="${escapeHtml(buildUnsubscribeUrl(context.recipientEmail, context.category))}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> · <a href="${escapeHtml(buildPreferencesUrl())}" style="color:#6b7280;text-decoration:underline;">Manage preferences</a></p>
      </div>`;

  const ctaBlock = context.actionUrl && context.actionLabel
    ? `<div style="margin:24px 0;">
        <a href="${escapeHtml(safeUrl(context.actionUrl))}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
          ${escapeHtml(context.actionLabel)}
        </a>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin:0; padding:0; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; color:#111827; }
    .container { max-width:560px; margin:0 auto; padding:24px; }
    .header { padding:24px 0; text-align:center; border-bottom:1px solid #e5e7eb; }
    .brand { font-size:20px; font-weight:700; color:#0f766e; letter-spacing:-0.01em; }
    .body { padding:24px 0; font-size:15px; line-height:1.6; }
    .footer { padding:16px 0 32px; text-align:center; color:#9ca3af; font-size:12px; }
    .preheader { display:none; max-height:0; overflow:hidden; opacity:0; }
    a { color:#0f766e; }
    @media (max-width: 480px) {
      .container { padding:16px; }
      .body { font-size:14px; }
    }
  </style>
</head>
<body>
  <div class="preheader">${escapeHtml(preheader)}</div>
  <div class="container">
    <div class="header">
      <div class="brand">${escapeHtml(brand)}</div>
    </div>
    <div class="body">
      ${bodyHtml}
      ${ctaBlock}
    </div>
    ${unsubscribeBlock}
    <div class="footer">
      <p>&copy; ${year} ${escapeHtml(brand)}. Lagos, Nigeria.</p>
      <p>This is a service email related to your account.</p>
    </div>
  </div>
</body>
</html>`;

  // Plain-text body — strip HTML tags for clients that don't render HTML.
  const text = `${subject}\n\n${brand}\n\n${stripHtml(bodyHtml)}\n${context.actionUrl ? `\n${context.actionLabel}: ${safeUrl(context.actionUrl)}\n` : ""}\n-- \n${brand} · Lagos, Nigeria\n${context.isMandatory ? "This is a service email related to your account." : `Manage preferences: ${buildPreferencesUrl()}\nUnsubscribe: ${buildUnsubscribeUrl(context.recipientEmail, context.category)}`}`;

  return { subject, text, html };
}

/**
 * Naive HTML-to-text conversion for the plain-text email fallback.
 * Removes tags, collapses whitespace. Sufficient for transactional emails.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function greeting(name: string): string {
  return `<p>Hi ${escapeHtml(name)},</p>`;
}

// ---------------------------------------------------------------------------
// Template registry.
// ---------------------------------------------------------------------------
type TemplateRenderer<I> = (input: I, context: TemplateContext) => EmailContent;

interface WelcomeInput {
  role: string;
}
const welcome: TemplateRenderer<WelcomeInput> = (input, ctx) => {
  return wrap({
    subject: "Welcome to Shelty",
    preheader: "Your account is ready. Let's get you listed.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Welcome to Shelty — Nigeria's trusted marketplace for property rentals, sales, and short-lets.</p>
      <p>You signed up as a <strong>${escapeHtml(input.role)}</strong>. Complete your profile to start listing properties, connect with agents, and reach verified buyers and tenants across Lagos, Abuja, and beyond.</p>
      <p>If you didn't create this account, please reply to this email and we'll look into it immediately.</p>`,
    context: { ...ctx, actionUrl: "/dashboard", actionLabel: "Go to your dashboard" },
  });
};

type EmailVerifiedInput = Record<string, never>;
const emailVerified: TemplateRenderer<EmailVerifiedInput> = (_input, ctx) => {
  return wrap({
    subject: "Email verified — welcome to Shelty",
    preheader: "Your email is confirmed.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Thanks for confirming your email. Your Shelty account is now fully active.</p>
      <p>Next step: complete your profile to start listing properties or browsing available homes in your area.</p>`,
    context: { ...ctx, actionUrl: "/dashboard", actionLabel: "Open your dashboard" },
  });
};

interface SecurityEventInput {
  eventDescription: string;
  whenIso: string;
  deviceInfo?: string;
}
const securityEvent: TemplateRenderer<SecurityEventInput> = (input, ctx) => {
  return wrap({
    subject: "Shelty security notification",
    preheader: "Important security event on your account.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We're contacting you because of an important security event on your Shelty account.</p>
      <p><strong>What happened:</strong> ${escapeHtml(input.eventDescription)}</p>
      <p><strong>When:</strong> ${escapeHtml(new Date(input.whenIso).toLocaleString("en-NG", { timeZone: "Africa/Lagos" }))}</p>
      ${input.deviceInfo ? `<p><strong>Device:</strong> ${escapeHtml(input.deviceInfo)}</p>` : ""}
      <p>If this was you, no action is needed. If you don't recognise this activity, please change your password immediately and contact our support team.</p>`,
    context: { ...ctx, actionUrl: "/dashboard/profile", actionLabel: "Review your account" },
  });
};

interface PasswordResetInput {
  resetUrl: string;
  expiresInMinutes: number;
}
const passwordReset: TemplateRenderer<PasswordResetInput> = (input, ctx) => {
  // The reset URL is a relative path on our origin.
  return wrap({
    subject: "Reset your Shelty password",
    preheader: "Password reset link requested.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We received a request to reset your Shelty password.</p>
      <p>Click the button below to choose a new password. This link will expire in <strong>${input.expiresInMinutes} minutes</strong>.</p>
      <p>If you didn't request a reset, you can safely ignore this email — your password is still safe.</p>`,
    context: {
      ...ctx,
      actionUrl: input.resetUrl,
      actionLabel: "Reset password",
    },
  });
};

interface VerificationStatusInput {
  tier: string;
  notes?: string;
}
const verificationSubmitted: TemplateRenderer<VerificationStatusInput> = (input, ctx) => {
  return wrap({
    subject: "Verification application submitted",
    preheader: `Your ${input.tier} verification is under review.`,
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We've received your <strong>${escapeHtml(input.tier)}</strong> verification application. Our team will review your submission and get back to you within 1-2 business days.</p>
      ${input.notes ? `<p><strong>Notes:</strong> ${escapeHtml(input.notes)}</p>` : ""}
      <p>You can check the status of your application anytime from your dashboard.</p>`,
    context: { ...ctx, actionUrl: "/dashboard/verification", actionLabel: "View verification status" },
  });
};
const verificationStatus: TemplateRenderer<VerificationStatusInput> = (input, ctx) => {
  return wrap({
    subject: "Verification update — under review",
    preheader: "Your verification application is now under admin review.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Good news — your <strong>${escapeHtml(input.tier)}</strong> verification application has moved to the next stage: <strong>under review</strong>.</p>
      <p>Our team is reviewing your submission. You'll receive another email as soon as a decision is made.</p>`,
    context: { ...ctx, actionUrl: "/dashboard/verification", actionLabel: "View verification status" },
  });
};
const verificationApproved: TemplateRenderer<VerificationStatusInput> = (input, ctx) => {
  return wrap({
    subject: `Verification approved — ${input.tier}`,
    preheader: `Your ${input.tier} verification is now live.`,
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Congratulations! Your <strong>${escapeHtml(input.tier)}</strong> verification has been approved.</p>
      <p>A verification badge will now appear next to your name on your listings and profile. Verified users earn more trust from buyers and tenants.</p>
      <p>Thank you for helping us keep Shelty a safe and trusted marketplace.</p>`,
    context: { ...ctx, actionUrl: "/dashboard/profile", actionLabel: "View your profile" },
  });
};
const verificationRejected: TemplateRenderer<VerificationStatusInput> = (input, ctx) => {
  return wrap({
    subject: "Verification application — update",
    preheader: "An update on your verification application.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Thanks for your interest in verification. We're unable to approve your <strong>${escapeHtml(input.tier)}</strong> verification application at this time.</p>
      ${input.notes ? `<p><strong>Reason:</strong> ${escapeHtml(input.notes)}</p>` : ""}
      <p>You can submit a new application after addressing the items above. A paid subscription does not guarantee verification — verification is reviewed separately.</p>`,
    context: { ...ctx, actionUrl: "/dashboard/verification", actionLabel: "Re-apply for verification" },
  });
};
const verificationRevoked: TemplateRenderer<VerificationStatusInput> = (input, ctx) => {
  return wrap({
    subject: "Important: verification revoked",
    preheader: "Your verification status has changed.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We're writing to let you know that your <strong>${escapeHtml(input.tier)}</strong> verification has been revoked.</p>
      ${input.notes ? `<p><strong>Reason:</strong> ${escapeHtml(input.notes)}</p>` : ""}
      <p>If you believe this is an error, please contact our support team.</p>`,
    context: { ...ctx, actionUrl: "/dashboard/verification", actionLabel: "View verification" },
  });
};

interface ApplicationReceivedInput {
  applicantName: string;
  propertyTitle: string;
  applicationId: string;
}
const applicationReceived: TemplateRenderer<ApplicationReceivedInput> = (input, ctx) => {
  return wrap({
    subject: `New application received — ${input.propertyTitle}`,
    preheader: `${input.applicantName} applied to represent your property.`,
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>You've received a new application from <strong>${escapeHtml(input.applicantName)}</strong> for your property <strong>${escapeHtml(input.propertyTitle)}</strong>.</p>
      <p>Review the applicant's profile and decide whether to accept or decline.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/applications`, actionLabel: "Review application" },
  });
};

interface ApplicationDecisionInput {
  propertyTitle: string;
  ownerName: string;
  reason?: string;
}
const applicationAccepted: TemplateRenderer<ApplicationDecisionInput> = (input, ctx) => {
  return wrap({
    subject: `Application accepted — ${input.propertyTitle}`,
    preheader: "Your application has been accepted.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Great news! <strong>${escapeHtml(input.ownerName)}</strong> has accepted your application to represent <strong>${escapeHtml(input.propertyTitle)}</strong>.</p>
      <p>You can now contact the property owner directly and start showing the property to interested tenants or buyers.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/applications`, actionLabel: "View application" },
  });
};
const applicationDeclined: TemplateRenderer<ApplicationDecisionInput> = (input, ctx) => {
  return wrap({
    subject: `Application update — ${input.propertyTitle}`,
    preheader: "An update on your recent application.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Thanks for your interest in <strong>${escapeHtml(input.propertyTitle)}</strong>. The owner has decided not to proceed with your application at this time.</p>
      ${input.reason ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>` : ""}
      <p>We encourage you to browse other listings on Shelty — there are plenty of opportunities waiting.</p>`,
    context: { ...ctx, actionUrl: `/properties`, actionLabel: "Browse properties" },
  });
};

interface RepresentationEstablishedInput {
  propertyTitle: string;
  counterpartyName: string;
}
const representationEstablished: TemplateRenderer<RepresentationEstablishedInput> = (input, ctx) => {
  return wrap({
    subject: `Representation established — ${input.propertyTitle}`,
    preheader: "You're now representing this property.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Representation has been established for <strong>${escapeHtml(input.propertyTitle)}</strong>.</p>
      <p>You can now contact <strong>${escapeHtml(input.counterpartyName)}</strong> directly through Shelty messaging.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/messages`, actionLabel: "Open messages" },
  });
};

interface NewMessageInput {
  senderName: string;
  /** Truncated preview — never the full message body. */
  preview: string;
  conversationId: string;
  unreadCount?: number;
}
const newMessage: TemplateRenderer<NewMessageInput> = (input, ctx) => {
  const preview = input.preview.length > 120 ? input.preview.slice(0, 120) + "…" : input.preview;
  const countLine = input.unreadCount && input.unreadCount > 1
    ? `<p>You have <strong>${input.unreadCount} unread messages</strong> in this conversation.</p>`
    : "";
  return wrap({
    subject: input.unreadCount && input.unreadCount > 1
      ? `You have ${input.unreadCount} new messages`
      : `${input.senderName} sent you a message`,
    preheader: preview,
    bodyHtml: `${greeting(ctx.recipientName)}
      <p><strong>${escapeHtml(input.senderName)}</strong> sent you a message on Shelty.</p>
      <p style="padding:12px 16px;background:#f3f4f6;border-left:3px solid #0f766e;border-radius:4px;font-style:italic;">"${escapeHtml(preview)}"</p>
      ${countLine}`,
    context: { ...ctx, actionUrl: `/dashboard/messages`, actionLabel: "Read message" },
  });
};

interface SavedSearchMatchInput {
  searchName: string;
  propertyTitle: string;
  propertyLocation: string;
  priceDisplay: string;
  propertyId: string;
}
const savedSearchMatch: TemplateRenderer<SavedSearchMatchInput> = (input, ctx) => {
  return wrap({
    subject: `New match for "${input.searchName}"`,
    preheader: `A new property matches your saved search.`,
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>A new property matching your saved search <strong>${escapeHtml(input.searchName)}</strong> has just been listed.</p>
      <p style="padding:12px 16px;background:#f3f4f6;border-radius:6px;">
        <strong>${escapeHtml(input.propertyTitle)}</strong><br>
        ${escapeHtml(input.propertyLocation)} · ${escapeHtml(input.priceDisplay)}
      </p>`,
    context: { ...ctx, actionUrl: `/properties/${input.propertyId}`, actionLabel: "View property" },
  });
};

interface ReviewReceivedInput {
  reviewerName: string;
  rating: number;
  /** Truncated review body. */
  preview: string;
}
const reviewReceived: TemplateRenderer<ReviewReceivedInput> = (input, ctx) => {
  const preview = input.preview.length > 160 ? input.preview.slice(0, 160) + "…" : input.preview;
  const stars = "★".repeat(Math.max(1, Math.min(5, input.rating)));
  return wrap({
    subject: `${input.reviewerName} left you a review`,
    preheader: `New ${input.rating}-star review received.`,
    bodyHtml: `${greeting(ctx.recipientName)}
      <p><strong>${escapeHtml(input.reviewerName)}</strong> just left you a review.</p>
      <p style="font-size:18px;color:#0f766e;">${escapeHtml(stars)}</p>
      <p style="padding:12px 16px;background:#f3f4f6;border-radius:6px;font-style:italic;">"${escapeHtml(preview)}"</p>
      <p>Reply to the review from your profile to thank them or address feedback.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/profile`, actionLabel: "View review" },
  });
};

interface SubscriptionActivatedInput {
  tier: string;
  amountNaira: number;
  period: string;
}
const subscriptionActivated: TemplateRenderer<SubscriptionActivatedInput> = (input, ctx) => {
  return wrap({
    subject: `Subscription activated — ${input.tier}`,
    preheader: "Your subscription is now live.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your <strong>${escapeHtml(input.tier)}</strong> subscription is now active.</p>
      <p><strong>Plan:</strong> ${escapeHtml(input.tier)} (${escapeHtml(input.period)})<br>
      <strong>Amount:</strong> ₦${input.amountNaira.toLocaleString("en-NG")}</p>
      <p>Your subscription will renew automatically at the end of the billing period. You can manage or cancel anytime from your dashboard.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/subscription`, actionLabel: "Manage subscription" },
  });
};
const subscriptionCancelled: TemplateRenderer<SubscriptionActivatedInput> = (input, ctx) => {
  return wrap({
    subject: "Subscription cancelled",
    preheader: "Your subscription has been cancelled.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your <strong>${escapeHtml(input.tier)}</strong> subscription has been cancelled.</p>
      <p>You'll continue to have access until the end of your current billing period. After that, your account will revert to the Free plan.</p>
      <p>You can re-subscribe anytime.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/subscription`, actionLabel: "Manage subscription" },
  });
};
const subscriptionExpiring: TemplateRenderer<SubscriptionActivatedInput> = (input, ctx) => {
  return wrap({
    subject: "Subscription renewing soon",
    preheader: "Your subscription will renew shortly.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your <strong>${escapeHtml(input.tier)}</strong> subscription is set to renew in the next 24 hours.</p>
      <p><strong>Renewal amount:</strong> ₦${input.amountNaira.toLocaleString("en-NG")}</p>
      <p>If you'd like to change your plan, do so before the renewal processes.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/subscription`, actionLabel: "Manage subscription" },
  });
};
const subscriptionPaymentFailed: TemplateRenderer<SubscriptionActivatedInput> = (input, ctx) => {
  return wrap({
    subject: "Subscription payment failed",
    preheader: "We couldn't process your renewal payment.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We were unable to process the payment for your <strong>${escapeHtml(input.tier)}</strong> subscription renewal.</p>
      <p>Please update your payment method to avoid losing access to your subscription benefits.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/subscription`, actionLabel: "Update payment" },
  });
};

interface PaymentSuccessfulInput {
  amountNaira: number;
  paymentType: string;
  reference: string;
}
const paymentSuccessful: TemplateRenderer<PaymentSuccessfulInput> = (input, ctx) => {
  return wrap({
    subject: "Payment successful",
    preheader: "We've received your payment.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We've received your payment of <strong>₦${input.amountNaira.toLocaleString("en-NG")}</strong>.</p>
      <p><strong>Type:</strong> ${escapeHtml(input.paymentType)}<br>
      <strong>Reference:</strong> ${escapeHtml(input.reference)}</p>
      <p>Thanks for using Shelty.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/payments`, actionLabel: "View payment history" },
  });
};
const paymentFailed: TemplateRenderer<PaymentSuccessfulInput> = (input, ctx) => {
  return wrap({
    subject: "Payment failed",
    preheader: "We couldn't complete your payment.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We couldn't complete your payment of <strong>₦${input.amountNaira.toLocaleString("en-NG")}</strong>.</p>
      <p><strong>Reference:</strong> ${escapeHtml(input.reference)}</p>
      <p>Please try again or use a different payment method. If the issue persists, contact your bank or our support team.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/payments`, actionLabel: "Retry payment" },
  });
};
const paymentRefunded: TemplateRenderer<PaymentSuccessfulInput> = (input, ctx) => {
  return wrap({
    subject: "Payment refunded",
    preheader: "We've issued a refund.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>A refund of <strong>₦${input.amountNaira.toLocaleString("en-NG")}</strong> has been issued for your payment.</p>
      <p><strong>Reference:</strong> ${escapeHtml(input.reference)}</p>
      <p>The refund may take 5-10 business days to appear on your statement, depending on your bank.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/payments`, actionLabel: "View payment history" },
  });
};

interface PromotionInput {
  propertyTitle: string;
  startDate: string;
  endDate: string;
  reason?: string;
}
const promotionSubmitted: TemplateRenderer<PromotionInput> = (input, ctx) => {
  return wrap({
    subject: `Promotion submitted — ${input.propertyTitle}`,
    preheader: "Your featured-listing promotion is under review.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your promotion for <strong>${escapeHtml(input.propertyTitle)}</strong> has been submitted and is pending review.</p>
      <p>You'll receive another email as soon as it's approved.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/promotions`, actionLabel: "View promotion" },
  });
};
const promotionApproved: TemplateRenderer<PromotionInput> = (input, ctx) => {
  return wrap({
    subject: `Promotion approved — ${input.propertyTitle}`,
    preheader: "Your promotion is now live.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your promotion for <strong>${escapeHtml(input.propertyTitle)}</strong> has been approved and is now live.</p>
      <p><strong>Start:</strong> ${escapeHtml(new Date(input.startDate).toLocaleDateString("en-NG"))}<br>
      <strong>End:</strong> ${escapeHtml(new Date(input.endDate).toLocaleDateString("en-NG"))}</p>`,
    context: { ...ctx, actionUrl: `/dashboard/promotions`, actionLabel: "View promotion" },
  });
};
const promotionRejected: TemplateRenderer<PromotionInput> = (input, ctx) => {
  return wrap({
    subject: `Promotion update — ${input.propertyTitle}`,
    preheader: "An update on your promotion request.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We're unable to approve your promotion for <strong>${escapeHtml(input.propertyTitle)}</strong> at this time.</p>
      ${input.reason ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>` : ""}
      <p>You can submit a new promotion after addressing the items above.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/promotions`, actionLabel: "View promotions" },
  });
};
const promotionExpiring: TemplateRenderer<PromotionInput> = (input, ctx) => {
  return wrap({
    subject: `Promotion expiring soon — ${input.propertyTitle}`,
    preheader: "Your featured-listing promotion will end soon.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your featured-listing promotion for <strong>${escapeHtml(input.propertyTitle)}</strong> will end on <strong>${escapeHtml(new Date(input.endDate).toLocaleDateString("en-NG"))}</strong>.</p>
      <p>Renew now to keep your listing at the top of search results.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/promotions`, actionLabel: "Renew promotion" },
  });
};

interface CampaignInput {
  campaignName: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}
const campaignSubmitted: TemplateRenderer<CampaignInput> = (input, ctx) => {
  return wrap({
    subject: `Campaign submitted — ${input.campaignName}`,
    preheader: "Your advertising campaign is pending review.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your advertising campaign <strong>${escapeHtml(input.campaignName)}</strong> has been submitted and is pending review.</p>
      <p>You'll receive another email as soon as it's approved.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/advertising`, actionLabel: "View campaign" },
  });
};
const campaignApproved: TemplateRenderer<CampaignInput> = (input, ctx) => {
  return wrap({
    subject: `Campaign approved — ${input.campaignName}`,
    preheader: "Your advertising campaign is now live.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your advertising campaign <strong>${escapeHtml(input.campaignName)}</strong> has been approved and is now serving impressions.</p>
      ${input.startDate ? `<p><strong>Start:</strong> ${escapeHtml(new Date(input.startDate).toLocaleDateString("en-NG"))}</p>` : ""}`,
    context: { ...ctx, actionUrl: `/dashboard/advertising`, actionLabel: "View campaign" },
  });
};
const campaignRejected: TemplateRenderer<CampaignInput> = (input, ctx) => {
  return wrap({
    subject: `Campaign update — ${input.campaignName}`,
    preheader: "An update on your advertising campaign.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>We're unable to approve your advertising campaign <strong>${escapeHtml(input.campaignName)}</strong> at this time.</p>
      ${input.reason ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>` : ""}`,
    context: { ...ctx, actionUrl: `/dashboard/advertising`, actionLabel: "View campaign" },
  });
};
const campaignExpiring: TemplateRenderer<CampaignInput> = (input, ctx) => {
  return wrap({
    subject: `Campaign expiring soon — ${input.campaignName}`,
    preheader: "Your campaign budget is running low.",
    bodyHtml: `${greeting(ctx.recipientName)}
      <p>Your advertising campaign <strong>${escapeHtml(input.campaignName)}</strong> is expiring soon.</p>
      ${input.endDate ? `<p><strong>End:</strong> ${escapeHtml(new Date(input.endDate).toLocaleDateString("en-NG"))}</p>` : ""}
      <p>Add budget to keep your campaign running.</p>`,
    context: { ...ctx, actionUrl: `/dashboard/advertising`, actionLabel: "Manage campaign" },
  });
};

// ---------------------------------------------------------------------------
// Registry + public dispatch function.
// ---------------------------------------------------------------------------
type TemplateInputMap = {
  welcome: WelcomeInput;
  email_verified: EmailVerifiedInput;
  security_event: SecurityEventInput;
  password_reset: PasswordResetInput;
  verification_submitted: VerificationStatusInput;
  verification_status: VerificationStatusInput;
  verification_approved: VerificationStatusInput;
  verification_rejected: VerificationStatusInput;
  verification_revoked: VerificationStatusInput;
  application_received: ApplicationReceivedInput;
  application_accepted: ApplicationDecisionInput;
  application_declined: ApplicationDecisionInput;
  representation_established: RepresentationEstablishedInput;
  new_message: NewMessageInput;
  saved_search_match: SavedSearchMatchInput;
  review_received: ReviewReceivedInput;
  subscription_activated: SubscriptionActivatedInput;
  subscription_cancelled: SubscriptionActivatedInput;
  subscription_expiring: SubscriptionActivatedInput;
  subscription_payment_failed: SubscriptionActivatedInput;
  payment_successful: PaymentSuccessfulInput;
  payment_failed: PaymentSuccessfulInput;
  payment_refunded: PaymentSuccessfulInput;
  promotion_submitted: PromotionInput;
  promotion_approved: PromotionInput;
  promotion_rejected: PromotionInput;
  promotion_expiring: PromotionInput;
  campaign_submitted: CampaignInput;
  campaign_approved: CampaignInput;
  campaign_rejected: CampaignInput;
  campaign_expiring: CampaignInput;
};

const REGISTRY: {
  [K in EmailTemplateSlug]: TemplateRenderer<TemplateInputMap[K]>;
} = {
  welcome: welcome,
  email_verified: emailVerified,
  security_event: securityEvent,
  password_reset: passwordReset,
  verification_submitted: verificationSubmitted,
  verification_status: verificationStatus,
  verification_approved: verificationApproved,
  verification_rejected: verificationRejected,
  verification_revoked: verificationRevoked,
  application_received: applicationReceived,
  application_accepted: applicationAccepted,
  application_declined: applicationDeclined,
  representation_established: representationEstablished,
  new_message: newMessage,
  saved_search_match: savedSearchMatch,
  review_received: reviewReceived,
  subscription_activated: subscriptionActivated,
  subscription_cancelled: subscriptionCancelled,
  subscription_expiring: subscriptionExpiring,
  subscription_payment_failed: subscriptionPaymentFailed,
  payment_successful: paymentSuccessful,
  payment_failed: paymentFailed,
  payment_refunded: paymentRefunded,
  promotion_submitted: promotionSubmitted,
  promotion_approved: promotionApproved,
  promotion_rejected: promotionRejected,
  promotion_expiring: promotionExpiring,
  campaign_submitted: campaignSubmitted,
  campaign_approved: campaignApproved,
  campaign_rejected: campaignRejected,
  campaign_expiring: campaignExpiring,
};

/**
 * Render an email template to { subject, text, html }.
 *
 * @throws if the template slug is unknown (programming error).
 */
export function renderEmail<K extends EmailTemplateSlug>(
  slug: K,
  input: TemplateInputMap[K],
  context: TemplateContext,
): EmailContent {
  const renderer = REGISTRY[slug] as TemplateRenderer<unknown>;
  if (!renderer) {
    throw new Error(`Unknown email template: ${slug}`);
  }
  return renderer(input, context);
}
