"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import {
  getCurrentUser,
  getCurrentProfile,
} from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { isPubliclyVisible } from "@/lib/properties/status-machine";
import { notificationService } from "@/lib/notifications";
import type { ProfileRow, PropertyRow } from "@/types";
import type { ApplicationStatus } from "@/types";

/**
 * Agent application server actions.
 *
 * Per spec Sections 4, 6, 7, 10, 11, 14, 17, 18, 21, 35, 36, 37, 41:
 *   * Only agents can submit applications (role derived from server session)
 *   * Monthly application limits enforced server-side via capability system
 *   * Duplicate active applications prevented by DB EXCLUDE constraint
 *   * Accept creates a representation relationship (migration 0020)
 *   * All status changes audited via audit_logs + property_interactions
 *   * Application data is private (messages, proposed terms never public)
 *   * Rate-limited to prevent spam
 */

export type ApplicationActionResult =
  | { ok: true; applicationId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string; limitReached?: boolean };

// ---------------------------------------------------------------------------
// SUBMIT APPLICATION
// ---------------------------------------------------------------------------

export async function submitApplication(input: {
  propertyId: string;
  message: string;
  proposedCommissionPct?: number;
  proposedCommissionFlat?: number;
  additionalInfo?: Record<string, unknown>;
}): Promise<ApplicationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to apply." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Only agents can submit applications (spec Section 4)
  if (profile.role !== "agent") {
    return {
      ok: false,
      message: "Only agents can submit property applications.",
    };
  }

  // Account must be active
  if (profile.account_status !== "active") {
    return {
      ok: false,
      message: `Your account is ${profile.account_status}. Please resolve this before applying.`,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Load the property + verify it's eligible (spec Section 6)
  const { data: propRow } = await supabase
    .from("properties")
    .select("id, owner_profile_id, listing_creator_id, managing_agent_id, status, deleted_at, published_at, title")
    .eq("id", input.propertyId)
    .maybeSingle();

  if (!propRow) {
    return { ok: false, message: "Property not found." };
  }

  const property = propRow as {
    id: string;
    owner_profile_id: string | null;
    listing_creator_id: string;
    managing_agent_id: string | null;
    status: string;
    deleted_at: string | null;
    published_at: string | null;
    title: string;
  };

  // Property must be publicly visible + available for applications
  if (property.deleted_at) {
    return { ok: false, message: "Property not found." };
  }
  if (!property.published_at) {
    return { ok: false, message: "Property not found." };
  }

  // Respect property status (spec Section 28)
  // Applications allowed for: available, application_pending, under_offer
  // NOT allowed for: rented, sold, unavailable, suspended, removed, draft
  if (!["available", "application_pending", "under_offer"].includes(property.status)) {
    return {
      ok: false,
      message: `This property is currently ${property.status.replace(/_/g, " ")} and is not accepting applications.`,
    };
  }

  // Applicant cannot be the property owner (spec Section 6)
  if (property.owner_profile_id === profile.id || property.listing_creator_id === profile.id) {
    return {
      ok: false,
      message: "You cannot apply to represent your own property.",
    };
  }

  // Applicant cannot be the current managing agent (spec Section 6)
  if (property.managing_agent_id === profile.id) {
    return {
      ok: false,
      message: "You are already the managing agent for this property.",
    };
  }

  // Check for existing active application (spec Section 11)
  // The DB EXCLUDE constraint also prevents this, but we check here for a
  // better error message before hitting the DB constraint.
  const { data: existingApp } = await supabase
    .from("property_applications")
    .select("id, status")
    .eq("property_id", input.propertyId)
    .eq("agent_id", profile.id)
    .in("status", ["pending", "accepted"])
    .maybeSingle();

  if (existingApp) {
    return {
      ok: false,
      message: "You already have an active application for this property.",
    };
  }

  // Monthly application limit (spec Section 7)
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  if (caps.maxApplicationsPerMonth !== null) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("property_applications")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", profile.id)
      .gte("created_at", monthStart.toISOString());

    if ((count ?? 0) >= caps.maxApplicationsPerMonth) {
      return {
        ok: false,
        limitReached: true,
        message: `You've reached your ${caps.maxApplicationsPerMonth} application limit for this month on the ${profile.subscription_tier} plan.`,
      };
    }
  }

  // Rate-limit (spec Section 30)
  const rl = await rateLimiter.check({
    key: user.id,
    action: "application",
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many applications. Try again later." };
  }

  // Validate message (spec Section 8)
  const message = input.message?.trim();
  if (!message || message.length < 10) {
    return {
      ok: false,
      fieldErrors: { message: ["Application message must be at least 10 characters."] },
    };
  }
  if (message.length > 2000) {
    return {
      ok: false,
      fieldErrors: { message: ["Application message must be at most 2000 characters."] },
    };
  }

  // Validate commission (optional, but if provided must be 0-100)
  if (input.proposedCommissionPct !== undefined && input.proposedCommissionPct !== null) {
    if (input.proposedCommissionPct < 0 || input.proposedCommissionPct > 100) {
      return {
        ok: false,
        fieldErrors: { proposedCommissionPct: ["Commission percentage must be between 0 and 100."] },
      };
    }
  }

  // Determine the decision_maker_id (spec Section 5)
  // The recipient is the property's owner_profile_id (or listing_creator_id if owner is null)
  const decisionMakerId = property.owner_profile_id ?? property.listing_creator_id;

  // Insert the application
  const { data: application, error } = await supabase
    .from("property_applications")
    .insert({
      property_id: input.propertyId,
      agent_id: profile.id,
      decision_maker_id: decisionMakerId,
      status: "pending",
      application_message: message,
      proposed_commission_pct: input.proposedCommissionPct ?? null,
      proposed_commission_flat: input.proposedCommissionFlat ?? null,
      additional_info: input.additionalInfo ?? {},
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30-day expiry
    })
    .select("id")
    .single();

  if (error) {
    // Check for EXCLUDE constraint violation (duplicate active application)
    if (error.code === "23P01") {
      return {
        ok: false,
        message: "You already have an active application for this property.",
      };
    }
    logger.error("Application submission failed", {
      userId: user.id,
      propertyId: input.propertyId,
      error: error.message,
    });
    return { ok: false, message: "We couldn't submit your application. Please try again." };
  }

  // Audit log
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "application.submit",
      target_type: "property_application",
      target_id: (application as { id: string }).id,
      metadata: { property_id: input.propertyId },
    });

    // Record a property_interaction (deal workflow tracking)
    await admin.from("property_interactions").insert({
      property_id: input.propertyId,
      actor_id: profile.id,
      application_id: (application as { id: string }).id,
      stage: "inquiry",
      notes: "Agent submitted application to represent property",
    });
  }

  // Notify the decision maker that a new application was received
  // (spec Section 22 — "Agent submits application → owner receives
  // notification"). Idempotent via eventKey.
  const applicationId = (application as { id: string }).id;
  await notificationService.dispatch({
    recipientId: decisionMakerId,
    type: "application.received",
    title: `New application from ${profile.full_name}`,
    body: `${profile.full_name} applied to represent "${property.title}".`,
    href: `/dashboard/applications`,
    relatedEntityType: "property_application",
    relatedEntityId: applicationId,
    eventKey: `application.received:${applicationId}`,
    metadata: {
      applicationId,
      propertyId: input.propertyId,
      propertyTitle: property.title,
      applicantId: profile.id,
      applicantName: profile.full_name,
    },
    emailTemplateInput: {
      applicantName: profile.full_name,
      propertyTitle: property.title,
      applicationId,
    },
  });
  // Confirm to the agent that their application was submitted
  await notificationService.dispatch({
    recipientId: profile.id,
    type: "application.submitted",
    title: "Application submitted",
    body: `Your application for "${property.title}" was submitted.`,
    href: `/dashboard/applications`,
    relatedEntityType: "property_application",
    relatedEntityId: applicationId,
    eventKey: `application.submitted:${applicationId}`,
    metadata: { applicationId, propertyId: input.propertyId, propertyTitle: property.title },
  });

  revalidatePath("/dashboard/applications", "page");
  return {
    ok: true,
    applicationId: (application as { id: string }).id,
    redirectTo: "/dashboard/applications",
  };
}

// ---------------------------------------------------------------------------
// WITHDRAW APPLICATION (agent action)
// ---------------------------------------------------------------------------

export async function withdrawApplication(applicationId: string): Promise<ApplicationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Profile not found." };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Fetch application + verify ownership
  const { data: appRow } = await supabase
    .from("property_applications")
    .select("id, agent_id, status, property_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!appRow) {
    return { ok: false, message: "Application not found." };
  }

  const app = appRow as {
    id: string;
    agent_id: string;
    status: string;
    property_id: string;
  };

  // Verify the caller is the agent who submitted this application
  if (app.agent_id !== profile.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Can only withdraw pending or accepted applications
  if (app.status !== "pending" && app.status !== "accepted") {
    return {
      ok: false,
      message: `Cannot withdraw an application in status "${app.status}".`,
    };
  }

  // Update status
  const { error } = await supabase
    .from("property_applications")
    .update({
      status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (error) {
    logger.error("Application withdrawal failed", { applicationId, error: error.message });
    return { ok: false, message: "We couldn't withdraw the application." };
  }

  // If the application was accepted, also end the representation
  if (app.status === "accepted") {
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("property_agent_representations")
        .update({
          status: "ended",
          ends_at: new Date().toISOString(),
          end_reason: "Agent withdrew application",
        })
        .eq("source_application_id", applicationId)
        .eq("status", "active");
    }
  }

  // Audit log
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "application.withdraw",
      target_type: "property_application",
      target_id: applicationId,
      metadata: { previous_status: app.status, property_id: app.property_id },
    });
  }

  revalidatePath("/dashboard/applications", "page");
  return { ok: true, redirectTo: "/dashboard/applications" };
}

// ---------------------------------------------------------------------------
// ACCEPT APPLICATION (owner/company action)
// ---------------------------------------------------------------------------

export async function acceptApplication(applicationId: string): Promise<ApplicationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Profile not found." };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Fetch application + property
  const { data: appRow } = await supabase
    .from("property_applications")
    .select("id, agent_id, decision_maker_id, status, property_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!appRow) {
    return { ok: false, message: "Application not found." };
  }

  const app = appRow as {
    id: string;
    agent_id: string;
    decision_maker_id: string;
    status: string;
    property_id: string;
  };

  // Verify the caller is the decision maker (spec Section 17, 20)
  if (app.decision_maker_id !== profile.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Application must be pending (spec Section 17)
  if (app.status !== "pending") {
    return {
      ok: false,
      message: `Cannot accept an application in status "${app.status}".`,
    };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "application",
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many actions. Try again later." };
  }

  // Verify the applicant's account is still active + still an agent (spec Section 17)
  const { data: agentProfile } = await supabase
    .from("profiles")
    .select("id, role, account_status, deleted_at")
    .eq("id", app.agent_id)
    .maybeSingle();

  const agent = agentProfile as {
    id: string;
    role: string;
    account_status: string;
    deleted_at: string | null;
  } | null;

  if (!agent || agent.deleted_at || agent.account_status !== "active" || agent.role !== "agent") {
    return {
      ok: false,
      message: "The applicant's account is no longer eligible.",
    };
  }

  // Update application status to accepted
  const { error: updateError } = await supabase
    .from("property_applications")
    .update({
      status: "accepted",
      decided_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    logger.error("Application accept failed", { applicationId, error: updateError.message });
    return { ok: false, message: "We couldn't accept the application." };
  }

  // Create the representation relationship (spec Section 18)
  const admin = createAdminClient();
  if (admin) {
    const { error: reprError } = await admin
      .from("property_agent_representations")
      .insert({
        property_id: app.property_id,
        agent_id: app.agent_id,
        owner_id: profile.id,
        source_application_id: applicationId,
        status: "active",
        starts_at: new Date().toISOString(),
      });

    if (reprError) {
      // The representation creation failed — but the application was already
      // accepted. Log loudly so admin can fix manually.
      logger.error("Representation creation failed after application accept", {
        applicationId,
        propertyId: app.property_id,
        agentId: app.agent_id,
        error: reprError.message,
      });
      // Don't fail the whole action — the application is accepted,
      // the representation can be created manually.
    }

    // Also update the property's managing_agent_id (primary managing agent)
    // Only set if there isn't already one
    await admin
      .from("properties")
      .update({ managing_agent_id: app.agent_id })
      .eq("id", app.property_id)
      .is("managing_agent_id", null);

    // Audit log
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "application.accept",
      target_type: "property_application",
      target_id: applicationId,
      metadata: {
        property_id: app.property_id,
        agent_id: app.agent_id,
      },
    });

    // Record property interaction
    await admin.from("property_interactions").insert({
      property_id: app.property_id,
      actor_id: profile.id,
      application_id: applicationId,
      stage: "offer_accepted",
      notes: "Owner accepted agent representation application",
    });
  }

  // Notify the agent that their application was accepted (spec Section 22).
  // Idempotent via eventKey — duplicate dispatch attempts are no-ops.
  await notificationService.dispatch({
    recipientId: app.agent_id,
    type: "application.accepted",
    title: "Your application was accepted",
    body: `${profile.full_name} accepted your application. You can now represent this property.`,
    href: `/dashboard/applications`,
    relatedEntityType: "property_application",
    relatedEntityId: applicationId,
    eventKey: `application.accepted:${applicationId}`,
    metadata: {
      applicationId,
      propertyId: app.property_id,
      decisionMakerId: profile.id,
      decisionMakerName: profile.full_name,
    },
    emailTemplateInput: {
      propertyTitle: "your property", // resolved by the email lookup; agent has the title in dashboard
      ownerName: profile.full_name,
    },
  });
  // Notify the agent that representation was established
  await notificationService.dispatch({
    recipientId: app.agent_id,
    type: "representation.established",
    title: "Representation established",
    body: "You're now the managing agent for this property.",
    href: `/dashboard/applications`,
    relatedEntityType: "property_application",
    relatedEntityId: applicationId,
    eventKey: `representation.established:${app.property_id}:${app.agent_id}`,
    metadata: {
      propertyId: app.property_id,
      agentId: app.agent_id,
      ownerId: profile.id,
    },
    emailTemplateInput: {
      propertyTitle: "your property",
      counterpartyName: profile.full_name,
    },
  });

  revalidatePath("/dashboard/applications", "page");
  revalidatePath(`/properties/${app.property_id}`, "page");
  return { ok: true, redirectTo: "/dashboard/applications" };
}

// ---------------------------------------------------------------------------
// DECLINE APPLICATION (owner/company action)
// ---------------------------------------------------------------------------

export async function declineApplication(input: {
  applicationId: string;
  reason?: string;
}): Promise<ApplicationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Profile not found." };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: appRow } = await supabase
    .from("property_applications")
    .select("id, decision_maker_id, status, property_id")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (!appRow) {
    return { ok: false, message: "Application not found." };
  }

  const app = appRow as {
    id: string;
    decision_maker_id: string;
    status: string;
    property_id: string;
  };

  // Verify authorization
  if (app.decision_maker_id !== profile.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Application must be pending
  if (app.status !== "pending") {
    return {
      ok: false,
      message: `Cannot decline an application in status "${app.status}".`,
    };
  }

  const { error } = await supabase
    .from("property_applications")
    .update({
      status: "declined",
      decided_at: new Date().toISOString(),
      decision_reason: input.reason?.trim() || null,
    })
    .eq("id", input.applicationId);

  if (error) {
    logger.error("Application decline failed", { applicationId: input.applicationId, error: error.message });
    return { ok: false, message: "We couldn't decline the application." };
  }

  // Audit log
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "application.decline",
      target_type: "property_application",
      target_id: input.applicationId,
      metadata: {
        property_id: app.property_id,
        reason: input.reason,
      },
    });
  }

  // Notify the agent that their application was declined (spec Section 22).
  await notificationService.dispatch({
    recipientId: app.agent_id,
    type: "application.declined",
    title: "Application update",
    body: `${profile.full_name} declined your application. Reason: ${input.reason ?? "No reason provided"}.`,
    href: `/dashboard/applications`,
    relatedEntityType: "property_application",
    relatedEntityId: input.applicationId,
    eventKey: `application.declined:${input.applicationId}`,
    metadata: {
      applicationId: input.applicationId,
      propertyId: app.property_id,
      decisionMakerName: profile.full_name,
      reason: input.reason,
    },
    emailTemplateInput: {
      propertyTitle: "the property",
      ownerName: profile.full_name,
      reason: input.reason,
    },
  });

  revalidatePath("/dashboard/applications", "page");
  return { ok: true, redirectTo: "/dashboard/applications" };
}
