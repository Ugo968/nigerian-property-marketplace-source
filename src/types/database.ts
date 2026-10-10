/**
 * Database row types — mirror the production Postgres schema in
 * supabase/migrations/. These types describe the SHAPE of rows returned
 * by Supabase queries.
 *
 * Production uses `supabase gen types typescript` to generate types from
 * the live database. In this foundation phase (no live Supabase instance
 * in the dev sandbox), these hand-maintained types serve as the source
 * of truth at the application layer.
 *
 * When the live Supabase project is connected, replace this file with
 * the generated `database.types.ts` and update imports if needed.
 */

import type {
  UserRole,
  SubscriptionTier,
  VerificationState,
  TransactionType,
  PriceFrequency,
  ApplicationStatus,
  DealStage,
  PaymentType,
  PaymentProvider,
  PaymentStatus,
  CampaignStatus,
  AdPlacement,
  AdvertiserCategory,
  NotificationLevel,
  NotificationPriority,
  NotificationChannel,
  NotificationCategory,
  EmailFrequency,
  EmailDeliveryStatus,
  EmailErrorCategory,
  AlertLevel,
  ReportReason,
  ReportStatus,
  TransactionStatus,
  InspectionStatus,
  OfferStatus,
  TransactionParticipantRole,
} from "./domain";

// ---------------------------------------------------------------------------
// PROFILES
// ---------------------------------------------------------------------------
export interface ProfileRow {
  id: string;
  user_id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  verification_state: VerificationState;
  subscription_tier: SubscriptionTier;
  avatar_url: string | null;
  bio: string | null;
  areas_served: string[] | null;
  social_handles: Record<string, string>;
  onboarding_completed: boolean;
  account_status: "active" | "suspended" | "banned" | "pending" | "deactivated";
  deleted_at: string | null;
  preferred_location: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LandlordProfileRow {
  profile_id: string;
  preferred_contact_method: "phone" | "email" | "whatsapp" | null;
  preferred_contact_value: string | null;
  ownership_summary: string | null;
  profile_completeness: number;
  verification_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentProfileRow {
  profile_id: string;
  professional_name: string | null;
  agency_name: string | null;
  agency_id: string | null;
  years_of_experience: number | null;
  license_number: string | null;
  license_issuing_body: string | null;
  professional_description: string | null;
  portfolio_url: string | null;
  profile_completeness: number;
  verification_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfileRow {
  profile_id: string;
  company_name: string;
  company_logo_url: string | null;
  company_description: string | null;
  cac_registration_number: string | null;
  cac_registered: boolean;
  office_address: string | null;
  office_state: string | null;
  office_lga: string | null;
  website: string | null;
  social_handles: Record<string, string>;
  profile_completeness: number;
  verification_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// VERIFICATION
// ---------------------------------------------------------------------------
export interface VerificationApplicationRow {
  id: string;
  applicant_id: string;
  tier: "bronze" | "blue";
  status:
    | "draft"
    | "submitted"
    | "in_review"
    | "approved"
    | "rejected"
    | "withdrawn"
    | "expired";
  applicant_summary: string | null;
  applicant_metadata: Record<string, unknown>;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationDocumentRow {
  id: string;
  application_id: string;
  document_type:
    | "government_id"
    | "utility_bill"
    | "proof_of_address"
    | "cac_certificate"
    | "business_license"
    | "professional_certification"
    | "agent_license"
    | "office_lease"
    | "other";
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

// ---------------------------------------------------------------------------
// PROPERTIES
// ---------------------------------------------------------------------------
export interface PropertyTypeRow {
  id: string;
  slug: string;
  label: string;
  category:
    | "residential"
    | "commercial"
    | "industrial"
    | "land"
    | "mixed_use"
    | "other";
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface PropertyRow {
  id: string;
  owner_profile_id: string | null;
  listing_creator_id: string;
  managing_agent_id: string | null;
  title: string;
  description: string | null;
  property_type_id: string;
  transaction_type: TransactionType;
  price: number;
  price_frequency: PriceFrequency | null;
  currency: "NGN" | "USD";
  bedrooms: number;
  bathrooms: number;
  toilets: number;
  size_value: number | null;
  size_unit: "sqm" | "sqft" | "acre" | "hectare" | "plot" | null;
  furnished: boolean;
  status:
    | "draft"
    | "available"
    | "application_pending"
    | "under_offer"
    | "rented"
    | "sold"
    | "unavailable"
    | "suspended"
    | "removed";
  availability_date: string | null;
  availability_end_date: string | null;
  deleted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyLocationRow {
  property_id: string;
  country: string;
  state: string;
  city: string;
  area: string | null;
  landmark: string | null;
  address_line: string | null;
  address_lga: string | null;
  private_lat: number | null;
  private_lng: number | null;
  public_lat: number | null;
  public_lng: number | null;
  created_at: string;
  updated_at: string;
}

export interface AmenityRow {
  id: string;
  slug: string;
  label: string;
  category:
    | "general"
    | "utility"
    | "security"
    | "outdoor"
    | "indoor"
    | "appliance"
    | "other";
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PropertyMediaRow {
  id: string;
  property_id: string;
  media_type: "image" | "video" | "floor_plan" | "document";
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  is_featured: boolean;
  uploaded_at: string;
}

// ---------------------------------------------------------------------------
// APPLICATIONS & INTERACTIONS
// ---------------------------------------------------------------------------
export interface PropertyApplicationRow {
  id: string;
  property_id: string;
  agent_id: string;
  decision_maker_id: string;
  status: ApplicationStatus;
  application_message: string | null;
  proposed_commission_pct: number | null;
  proposed_commission_flat: number | null;
  additional_info: Record<string, unknown>;
  decided_at: string | null;
  decision_reason: string | null;
  expires_at: string | null;
  withdrawn_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyInteractionRow {
  id: string;
  property_id: string;
  actor_id: string | null;
  application_id: string | null;
  stage: DealStage;
  notes: string | null;
  metadata: Record<string, unknown>;
  scheduled_for: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// SAVED ITEMS
// ---------------------------------------------------------------------------
export interface SavedPropertyRow {
  id: string;
  user_id: string;
  property_id: string;
  collection_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  criteria: Record<string, unknown>;
  transaction_type: TransactionType | null;
  property_type_id: string | null;
  state: string | null;
  city: string | null;
  price_min: number | null;
  price_max: number | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  is_active: boolean;
  alert_level: AlertLevel;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyAlertRow {
  id: string;
  user_id: string;
  saved_search_id: string;
  property_id: string;
  alert_type:
    | "new_match"
    | "price_change"
    | "status_change"
    | "availability_change";
  delivery_status: "pending" | "sent" | "failed" | "dismissed";
  sent_at: string | null;
  notification_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// SUBSCRIPTIONS & PAYMENTS
// ---------------------------------------------------------------------------
export interface SubscriptionPlanRow {
  id: string;
  role: UserRole;
  tier: SubscriptionTier;
  price_naira: number;
  is_variable_price: boolean;
  billing_cycle: "monthly" | "quarterly" | "annually";
  is_default: boolean;
  is_sellable: boolean;
  tagline: string | null;
  highlights: string[];
  capabilities: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserSubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  role: UserRole;
  tier: SubscriptionTier;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "cancelled"
    | "expired"
    | "incomplete";
  provider: PaymentProvider | null;
  provider_customer_ref: string | null;
  provider_subscription_ref: string | null;
  billing_cycle: "monthly" | "quarterly" | "annually";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  trial_start: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  currency: "NGN" | "USD";
  provider: PaymentProvider;
  provider_reference: string | null;
  provider_payment_ref: string | null;
  payment_type: PaymentType;
  related_resource_id: string | null;
  status: PaymentStatus;
  metadata: Record<string, unknown>;
  initiated_at: string;
  verified_at: string | null;
  verification_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// FEATURED LISTINGS
// ---------------------------------------------------------------------------
export interface FeaturedListingCreditRow {
  id: string;
  user_id: string;
  source: "plan_allocation" | "purchase" | "admin_grant";
  source_ref: string | null;
  amount: number;
  remaining: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeaturedListingRow {
  id: string;
  property_id: string;
  purchaser_id: string;
  placement: "homepage" | "search" | "category" | "location";
  target_context: Record<string, unknown>;
  credit_id: string | null;
  payment_id: string | null;
  status: "scheduled" | "active" | "paused" | "ended" | "cancelled";
  starts_at: string;
  ends_at: string;
  impressions: number;
  clicks: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// ADVERTISING
// ---------------------------------------------------------------------------
export interface AdvertisingBusinessRow {
  id: string;
  owner_user_id: string;
  business_name: string;
  category_id: string;
  contact_email: string;
  contact_phone: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  address: string | null;
  state: string | null;
  city: string | null;
  status: "pending_review" | "approved" | "suspended" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface AdvertisingCampaignRow {
  id: string;
  business_id: string;
  name: string;
  creative_id: string | null;
  status: CampaignStatus;
  budget_naira: number;
  spent_naira: number;
  placement_id: string;
  target_categories: string[];
  target_states: string[];
  target_cities: string[];
  starts_at: string | null;
  ends_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  rejection_reason: string | null;
  impressions: number;
  clicks: number;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// REVIEWS
// ---------------------------------------------------------------------------
export interface ReviewRow {
  id: string;
  reviewer_id: string;
  reviewed_id: string;
  reviewed_entity_type: "landlord" | "agent" | "company";
  application_id: string | null;
  conversation_id: string | null;
  property_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: "pending" | "published" | "hidden" | "removed";
  moderation_reason: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  response_text: string | null;
  response_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// MESSAGING
// ---------------------------------------------------------------------------
export interface ConversationRow {
  id: string;
  property_id: string | null;
  application_id: string | null;
  conversation_type: "marketplace" | "application" | "support";
  last_message_at: string | null;
  last_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: "text" | "image" | "file" | "system" | "property_share";
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  shared_property_id: string | null;
  status: "sent" | "delivered" | "read";
  edited_at: string | null;
  deleted_at: string | null;
  reported_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS & REPORTS
// ---------------------------------------------------------------------------
export interface NotificationRow {
  id: string;
  recipient_id: string;
  type: string;
  level: NotificationLevel;
  title: string;
  body: string | null;
  href: string | null;
  related: Record<string, unknown>;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  // 0023_extensions
  priority: NotificationPriority;
  channel: NotificationChannel;
  related_entity_type: string | null;
  related_entity_id: string | null;
  event_key: string | null;
  metadata: Record<string, unknown>;
  expires_at: string | null;
}

export interface NotificationPreferenceRow {
  id: string;
  user_id: string;
  category: NotificationCategory;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_frequency: EmailFrequency;
  created_at: string;
  updated_at: string;
}

export interface NotificationEventRow {
  id: string;
  event_key: string;
  event_type: string;
  actor_id: string | null;
  recipient_id: string | null;
  payload: Record<string, unknown>;
  produced_notification_ids: string[];
  status: "processed" | "failed" | "superseded";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailDeliveryRecordRow {
  id: string;
  notification_id: string | null;
  event_key: string | null;
  recipient_id: string | null;
  recipient_email: string;
  template: string;
  provider: string;
  provider_message_id: string | null;
  status: EmailDeliveryStatus;
  error_category: EmailErrorCategory | null;
  error_message: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  reporter_id: string | null;
  reporter_email: string | null;
  entity_type:
    | "property"
    | "profile"
    | "review"
    | "message"
    | "advertising_business"
    | "advertising_campaign"
    | "other";
  entity_id: string;
  reason: ReportReason;
  description: string;
  evidence: Record<string, unknown>;
  status: ReportStatus;
  resolution_notes: string | null;
  resolution_action: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminActionRecordRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_type:
    | "user"
    | "property"
    | "verification_application"
    | "review"
    | "report"
    | "conversation"
    | "message"
    | "advertising_business"
    | "advertising_campaign"
    | "featured_listing"
    | "subscription"
    | "payment"
    | "notification";
  target_id: string;
  reason: string | null;
  previous_state: string | null;
  new_state: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ReportCategoryRow {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  applicable_entity_types: string[];
  severity: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformSettingRow {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  value_type: "number" | "string" | "boolean" | "json";
  is_editable: boolean;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// PROPERTY TRANSACTION WORKFLOW (Prompt 18)
// ---------------------------------------------------------------------------
export interface TransactionRow {
  id: string;
  property_id: string;
  transaction_type: "rent" | "sale" | "shortlet";
  initiated_by: string;
  owner_id: string | null;
  customer_id: string;
  managing_agent_id: string | null;
  managing_company_id: string | null;
  current_status: TransactionStatus;
  conversation_id: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  accepted_offer_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TransactionParticipantRow {
  id: string;
  transaction_id: string;
  user_id: string;
  role: TransactionParticipantRole;
  is_active: boolean;
  created_at: string;
}

export interface TransactionStatusHistoryRow {
  id: string;
  transaction_id: string;
  previous_status: TransactionStatus | null;
  new_status: TransactionStatus;
  actor_profile_id: string | null;
  actor_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface InspectionRow {
  id: string;
  transaction_id: string;
  property_id: string;
  proposed_at: string;
  proposed_timezone: string;
  proposed_ends_at: string | null;
  proposed_by: string;
  status: InspectionStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NegotiationRecordRow {
  id: string;
  transaction_id: string;
  proposed_by: string;
  proposed_amount: number;
  currency: string;
  price_frequency: string | null;
  terms: string | null;
  status: "pending" | "accepted" | "declined" | "superseded";
  responded_by: string | null;
  responded_at: string | null;
  response_notes: string | null;
  created_at: string;
}

export interface OfferRow {
  id: string;
  transaction_id: string;
  submitted_by: string;
  offered_amount: number;
  currency: string;
  price_frequency: string | null;
  terms: string | null;
  expires_at: string;
  status: OfferStatus;
  supersedes_offer_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  is_immutable: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfferHistoryRow {
  id: string;
  offer_id: string;
  previous_status: OfferStatus | null;
  new_status: OfferStatus;
  actor_profile_id: string | null;
  actor_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Database shape — used by Supabase client typing
// ---------------------------------------------------------------------------
export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow> };
      landlord_profiles: { Row: LandlordProfileRow; Insert: Partial<LandlordProfileRow>; Update: Partial<LandlordProfileRow> };
      agent_profiles: { Row: AgentProfileRow; Insert: Partial<AgentProfileRow>; Update: Partial<AgentProfileRow> };
      company_profiles: { Row: CompanyProfileRow; Insert: Partial<CompanyProfileRow>; Update: Partial<CompanyProfileRow> };
      admin_users: {
        Row: { id: string; user_id: string; role: "admin" | "super_admin"; permissions: string[]; created_at: string; updated_at: string };
        Insert: { user_id: string; role?: "admin" | "super_admin"; permissions?: string[] };
        Update: Partial<{ role: "admin" | "super_admin"; permissions: string[] }>;
      };
      audit_logs: { Row: AuditLogRow; Insert: Partial<AuditLogRow>; Update: never };
      verification_applications: { Row: VerificationApplicationRow; Insert: Partial<VerificationApplicationRow>; Update: Partial<VerificationApplicationRow> };
      verification_documents: { Row: VerificationDocumentRow; Insert: Partial<VerificationDocumentRow>; Update: never };
      verification_reviews: {
        Row: { id: string; application_id: string; reviewer_id: string; decision: "in_review" | "approved" | "rejected" | "revoked" | "revised"; notes: string | null; created_at: string };
        Insert: Partial<{ application_id: string; reviewer_id: string; decision: "in_review" | "approved" | "rejected" | "revoked" | "revised"; notes: string }>;
        Update: never;
      };
      verification_history: {
        Row: { id: string; profile_id: string; previous_state: VerificationState | null; new_state: VerificationState; application_id: string | null; actor_id: string | null; reason: string | null; created_at: string };
        Insert: Partial<{ profile_id: string; new_state: VerificationState }>;
        Update: never;
      };
      properties: { Row: PropertyRow; Insert: Partial<PropertyRow>; Update: Partial<PropertyRow> };
      property_locations: { Row: PropertyLocationRow; Insert: Partial<PropertyLocationRow>; Update: Partial<PropertyLocationRow> };
      property_types: { Row: PropertyTypeRow; Insert: Partial<PropertyTypeRow>; Update: Partial<PropertyTypeRow> };
      amenities: { Row: AmenityRow; Insert: Partial<AmenityRow>; Update: Partial<AmenityRow> };
      property_amenities: {
        Row: { property_id: string; amenity_id: string; value: string | null; created_at: string };
        Insert: Partial<{ property_id: string; amenity_id: string; value?: string }>;
        Update: Partial<{ value: string | null }>;
      };
      property_media: { Row: PropertyMediaRow; Insert: Partial<PropertyMediaRow>; Update: Partial<PropertyMediaRow> };
      property_applications: { Row: PropertyApplicationRow; Insert: Partial<PropertyApplicationRow>; Update: Partial<PropertyApplicationRow> };
      property_interactions: { Row: PropertyInteractionRow; Insert: Partial<PropertyInteractionRow>; Update: never };
      saved_properties: { Row: SavedPropertyRow; Insert: Partial<SavedPropertyRow>; Update: never };
      saved_searches: { Row: SavedSearchRow; Insert: Partial<SavedSearchRow>; Update: Partial<SavedSearchRow> };
      property_alerts: { Row: PropertyAlertRow; Insert: Partial<PropertyAlertRow>; Update: Partial<PropertyAlertRow> };
      subscription_plans: { Row: SubscriptionPlanRow; Insert: Partial<SubscriptionPlanRow>; Update: Partial<SubscriptionPlanRow> };
      user_subscriptions: { Row: UserSubscriptionRow; Insert: Partial<UserSubscriptionRow>; Update: Partial<UserSubscriptionRow> };
      payments: { Row: PaymentRow; Insert: Partial<PaymentRow>; Update: Partial<PaymentRow> };
      payment_events: {
        Row: { id: string; payment_id: string; provider: PaymentProvider; provider_event: string; provider_event_id: string | null; raw_payload: Record<string, unknown>; received_at: string; processed_at: string | null };
        Insert: Partial<{ payment_id: string; provider: PaymentProvider; provider_event: string; raw_payload: Record<string, unknown> }>;
        Update: Partial<{ processed_at: string | null }>;
      };
      featured_listing_credits: { Row: FeaturedListingCreditRow; Insert: Partial<FeaturedListingCreditRow>; Update: Partial<FeaturedListingCreditRow> };
      featured_listings: { Row: FeaturedListingRow; Insert: Partial<FeaturedListingRow>; Update: Partial<FeaturedListingRow> };
      advertiser_categories: { Row: { id: string; slug: AdvertiserCategory; label: string; is_active: boolean; sort_order: number; created_at: string }; Insert: Partial<{ slug: AdvertiserCategory; label: string }>; Update: never };
      advertising_placements: { Row: { id: string; slug: AdPlacement; label: string; is_active: boolean; sort_order: number; created_at: string }; Insert: Partial<{ slug: AdPlacement; label: string }>; Update: never };
      advertising_businesses: { Row: AdvertisingBusinessRow; Insert: Partial<AdvertisingBusinessRow>; Update: Partial<AdvertisingBusinessRow> };
      advertising_creatives: {
        Row: { id: string; business_id: string; creative_type: "image" | "video" | "text"; storage_path: string; file_name: string; mime_type: string; size_bytes: number; headline: string | null; body_text: string | null; cta_text: string | null; target_url: string; created_at: string };
        Insert: Partial<{ business_id: string; creative_type: "image" | "video" | "text"; storage_path: string; file_name: string; mime_type: string; size_bytes: number; target_url: string }>;
        Update: Partial<{ headline: string | null; body_text: string | null; cta_text: string | null }>;
      };
      advertising_campaigns: { Row: AdvertisingCampaignRow; Insert: Partial<AdvertisingCampaignRow>; Update: Partial<AdvertisingCampaignRow> };
      reviews: { Row: ReviewRow; Insert: Partial<ReviewRow>; Update: Partial<ReviewRow> };
      conversations: { Row: ConversationRow; Insert: Partial<ConversationRow>; Update: Partial<ConversationRow> };
      conversation_participants: {
        Row: { conversation_id: string; user_id: string; last_read_message_id: string | null; unread_count: number; archived_at: string | null; muted: boolean; joined_at: string };
        Insert: Partial<{ conversation_id: string; user_id: string }>;
        Update: Partial<{ last_read_message_id: string | null; unread_count: number; archived_at: string | null; muted: boolean }>;
      };
      messages: { Row: MessageRow; Insert: Partial<MessageRow>; Update: Partial<MessageRow> };
      conversation_blocks: {
        Row: { id: string; blocker_id: string; blocked_id: string; reason: string | null; created_at: string };
        Insert: Partial<{ blocker_id: string; blocked_id: string; reason?: string }>;
        Update: never;
      };
      notifications: { Row: NotificationRow; Insert: Partial<NotificationRow>; Update: Partial<NotificationRow> };
      notification_preferences: { Row: NotificationPreferenceRow; Insert: Partial<NotificationPreferenceRow>; Update: Partial<NotificationPreferenceRow> };
      notification_events: { Row: NotificationEventRow; Insert: Partial<NotificationEventRow>; Update: Partial<NotificationEventRow> };
      email_delivery_records: { Row: EmailDeliveryRecordRow; Insert: Partial<EmailDeliveryRecordRow>; Update: Partial<EmailDeliveryRecordRow> };
      admin_action_records: { Row: AdminActionRecordRow; Insert: Partial<AdminActionRecordRow>; Update: never };
      report_categories: { Row: ReportCategoryRow; Insert: Partial<ReportCategoryRow>; Update: Partial<ReportCategoryRow> };
      platform_settings: { Row: PlatformSettingRow; Insert: Partial<PlatformSettingRow>; Update: Partial<PlatformSettingRow> };
      reports: { Row: ReportRow; Insert: Partial<ReportRow>; Update: Partial<ReportRow> };
      property_view_counts: {
        Row: { property_id: string; views: number; unique_views: number; updated_at: string };
        Insert: Partial<{ property_id: string; views?: number; unique_views?: number }>;
        Update: Partial<{ views: number; unique_views: number }>;
      };
      transactions: { Row: TransactionRow; Insert: Partial<TransactionRow>; Update: Partial<TransactionRow> };
      transaction_participants: { Row: TransactionParticipantRow; Insert: Partial<TransactionParticipantRow>; Update: Partial<TransactionParticipantRow> };
      transaction_status_history: { Row: TransactionStatusHistoryRow; Insert: Partial<TransactionStatusHistoryRow>; Update: never };
      inspections: { Row: InspectionRow; Insert: Partial<InspectionRow>; Update: Partial<InspectionRow> };
      negotiation_records: { Row: NegotiationRecordRow; Insert: Partial<NegotiationRecordRow>; Update: Partial<NegotiationRecordRow> };
      offers: { Row: OfferRow; Insert: Partial<OfferRow>; Update: Partial<OfferRow> };
      offer_history: { Row: OfferHistoryRow; Insert: Partial<OfferHistoryRow>; Update: never };
    };
    Functions: {
      is_admin: (args: { checkUser: string }) => Promise<boolean>;
      is_caller_admin: () => Promise<boolean>;
      user_profile_id: () => Promise<string | null>;
      can_manage_property: (args: { propUuid: string }) => Promise<boolean>;
      mark_notification_read: (args: { notificationUuid: string }) => Promise<void>;
      mark_notification_unread: (args: { notificationUuid: string }) => Promise<void>;
      mark_all_notifications_read: () => Promise<void>;
      dismiss_notification: (args: { notificationUuid: string }) => Promise<void>;
      dispatch_notification: (args: {
        p_recipient_id: string;
        p_type: string;
        p_title: string;
        p_body?: string;
        p_level?: string;
        p_priority?: string;
        p_channel?: string;
        p_href?: string;
        p_related?: Record<string, unknown>;
        p_related_entity_type?: string;
        p_related_entity_id?: string;
        p_event_key?: string;
        p_metadata?: Record<string, unknown>;
        p_expires_at?: string;
      }) => Promise<string | null>;
      increment_property_views: (args: { propUuid: string }) => Promise<void>;
      record_audit: (args: { action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }) => Promise<void>;
      accept_transaction_offer: (args: {
        p_transaction_id: string;
        p_offer_id: string;
        p_acceptor_profile_id: string;
        p_reason?: string;
      }) => Promise<boolean>;
      complete_transaction: (args: {
        p_transaction_id: string;
        p_completer_profile_id: string;
        p_completion_notes?: string;
      }) => Promise<boolean>;
      cancel_transaction: (args: {
        p_transaction_id: string;
        p_canceller_profile_id: string;
        p_reason: string;
        p_new_status?: string;
      }) => Promise<boolean>;
      transition_transaction: (args: {
        p_transaction_id: string;
        p_new_status: string;
        p_actor_profile_id: string;
        p_reason?: string;
      }) => Promise<boolean>;
    };
  };
}
