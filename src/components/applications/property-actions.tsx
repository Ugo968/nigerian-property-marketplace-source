"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Heart, MessageSquare, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog";
import type { PublicProperty } from "@/lib/properties/public-fetcher";
import type { ProfileRow } from "@/types";

/**
 * Property contact + apply actions.
 *
 * Per spec Sections 8, 9, 27, 32:
 *   * "Apply to Represent This Property" CTA for eligible agents
 *   * "Message" button links to the future messaging system (extension point)
 *   * "View Properties" links to the lister's other listings
 *   * Verification badge shown where applicable
 *   * The Apply button opens the ApplicationFormDialog
 *
 * Non-agents (landlords, companies) don't see the Apply button.
 * The owner of the property doesn't see the Apply button.
 */
export interface PropertyActionsProps {
  property: PublicProperty;
  callerProfile: ProfileRow | null;
}

export function PropertyActions({ property, callerProfile }: PropertyActionsProps) {
  const router = useRouter();
  const [applyOpen, setApplyOpen] = React.useState(false);

  const isAgent = callerProfile?.role === "agent";
  const isOwner = callerProfile?.id === property.listedBy.id;
  const isManagingAgent = false; // would check representation table

  const canApply = isAgent && !isOwner && !isManagingAgent &&
    ["available", "application_pending", "under_offer"].includes(property.status);

  return (
    <>
      <div className="space-y-2">
        {canApply ? (
          <Button className="w-full" onClick={() => setApplyOpen(true)}>
            <Send className="h-4 w-4 mr-1" aria-hidden="true" />
            Apply to Represent
          </Button>
        ) : null}

        {/* Message — links to future messaging system (extension point) */}
        <Button asChild variant="outline" className="w-full">
          <a href={`/dashboard/messages?new=true&to=${property.listedBy.id}&property=${property.id}`}>
            <MessageSquare className="h-4 w-4 mr-1" aria-hidden="true" />
            Message
          </a>
        </Button>

        {/* View lister's other properties */}
        <Button asChild variant="ghost" size="sm" className="w-full">
          <a href={`/properties?owner=${property.listedBy.id}`}>
            <Building2 className="h-4 w-4 mr-1" aria-hidden="true" />
            View lister's properties
          </a>
        </Button>
      </div>

      {canApply ? (
        <ApplicationFormDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          property={{
            id: property.id,
            title: property.title,
            area: property.location?.area ?? null,
            city: property.location?.city ?? null,
            state: property.location?.state ?? null,
            price: property.price,
            priceFrequency: property.priceFrequency,
            currency: property.currency,
            transactionType: property.transactionType,
            imageUrl: property.media.find((m) => m.is_featured)?.storage_path ?? property.media[0]?.storage_path ?? null,
          }}
          agent={{
            fullName: callerProfile!.full_name,
            verificationState: callerProfile!.verification_state,
          }}
        />
      ) : null}
    </>
  );
}
