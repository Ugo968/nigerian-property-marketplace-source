/**
 * Admin module barrel.
 *
 * Single import surface for everything admin-related:
 *   import { requireAdmin, adminListUsers, suspendUserAction } from "@/lib/admin";
 *
 * Modules outside this folder should NOT import from individual files.
 */

// Authorization boundary
export {
  requireAdmin,
  requireAdminPermission,
  getAdminIdentity,
  hasAdminPermission,
  assertAdminPermission,
  ADMIN_PERMISSIONS,
} from "./permissions";
export type {
  AdminPermission,
  AdminIdentity,
  AdminRole,
} from "./permissions";

// Audit log helper
export { recordAdminAction } from "./audit";
export type { AdminTargetType, RecordAdminActionInput } from "./audit";

// Server actions
export {
  suspendUserAction,
  reactivateUserAction,
  banUserAction,
  suspendPropertyAction,
  removePropertyAction,
  restorePropertyAction,
  hideReviewAction,
  removeReviewAction,
  restoreReviewAction,
  setReportStatusAction,
  approvePromotionAction,
  rejectPromotionAction,
  approveCampaignAction,
  rejectCampaignAction,
  pauseCampaignAction,
  suspendAdvertiserAction,
  updatePlatformSettingAction,
} from "./actions";
export type { AdminActionResult } from "./actions";

// Fetchers
export {
  getDashboardMetrics,
  adminListUsers,
  adminGetUserDetail,
  adminListProperties,
  adminListVerifications,
  adminListReviews,
  adminListReports,
  adminGetReport,
  adminListPayments,
  adminListSubscriptions,
  adminListPromotions,
  adminListCampaigns,
  adminListNotifications,
  adminListEmailDelivery,
  adminListAuditLogs,
  adminListModerationHistory,
  adminListReportCategories,
  adminListPlatformSettings,
} from "./fetchers";
export type {
  DashboardMetrics,
  AdminUserListFilters,
  AdminUserListResult,
  AdminUserDetail,
  AdminPropertyListFilters,
} from "./fetchers";
