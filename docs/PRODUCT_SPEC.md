# PRODUCT_SPEC

This document preserves the master product specification for the Shelty marketplace. It is the source of truth for business rules, pricing, roles, and limits. Implementation must conform to this document; this document must not be silently changed.

## Concept

A Nigerian real-estate marketplace connecting:

1. Landlords / Property Owners
2. Independent Real Estate Agents / Realtors
3. Real Estate Companies

The platform allows property owners and companies to list properties and allows agents to discover properties and apply to represent them.

## User roles

Exactly THREE core marketplace roles. One account → one role.

- **Landlord / Property Owner** — individuals who own property
- **Real Estate Agent / Realtor** — independent agents
- **Real Estate Company** — registered real-estate businesses

> A fourth role for carpenters, plumbers, etc. does NOT exist. Those businesses use the separate **advertising system**.

## Property marketplace

Supports ALL property types — apartments, houses, duplexes, terraces, bungalows, land, plots, commercial, offices, shops, warehouses, industrial, event spaces, hotels, short-lets, student accommodation, estates, mixed-use, and others. The property-type system is extensible.

### Transaction types

- **Rent** — annual, monthly, other periods
- **Sale** — land, houses, commercial, etc.
- **Short-let** — daily, weekly, monthly

## Pricing (immutable)

Source: `src/lib/subscriptions/plans.ts`

| Role | Free | Pro | Premium |
|---|---|---|---|
| Landlord | ₦0 | ₦3,500/month | ₦9,500/month |
| Agent | ₦0 | ₦5,000/month | ₦12,000/month |
| Company | ₦0 | ₦20,000/month | ₦35,000+/month |

Everyone starts Free. Verification is separate from subscription.

## Verification tiers

- Unverified
- Verification Pending
- Bronze Verified (basic professional / account verification)
- Blue Verified (higher-level professional / business verification)
- Rejected
- Suspended
- Revoked

Paying for Pro or Premium does NOT grant a verification badge. Verification is granted by admin review only.

## V1 transaction boundary

The platform does NOT hold property purchase / rent money between users in V1. The actual money moves externally between buyer/tenant and the property owner / authorised party. The platform tracks the deal workflow:

```
Inquiry → Inspection Scheduled → Inspection Completed → Negotiation
→ Offer Made → Offer Accepted → Transaction Completed
```

## Advertising system

Separate from marketplace roles. Businesses (carpenters, plumbers, electricians, etc.) use this system. Minimum advertising spend: **₦5,000** (not the only price — the floor).

All advertisements must be clearly labeled as "Sponsored" / "Advertisement".

## Search ranking principle

Search ranking is NOT determined by who pays the most. Ranking considers:
1. Relevance
2. Location
3. Freshness
4. Verification / trust
5. Listing completeness
6. Quality / reliability
7. Featured status
8. Subscription-based promotional boost

Paid placements are clearly labeled.

## Safety warning

The platform prominently warns users to physically inspect a property and independently verify ownership, agent identity, documents, and payment information before paying. The platform does NOT imply that every listing has been independently verified.

Implementation: `src/components/layout/safety-notice.tsx`, shown on listing pages.

## Master user journey

Landlord:
Signup → Choose Landlord → Complete profile → Create property → Upload media → Publish → Receive agent applications → Review → Accept/decline → Chat → Arrange inspection → Complete transaction externally → Review agent

Agent:
Signup → Choose Agent → Complete profile → Browse → Save → Apply to represent → Owner accepts → Chat → Work → Receive review

Company:
Signup → Choose Company → Complete profile → Add properties → Manage applications → Manage agents/staff → Communicate → Track → Promote → Manage team → View analytics

Advertiser:
Create advertising profile → Create campaign → Select placement/targeting → Choose package → Pay → Payment verified → Campaign activated → Advertisement displayed → View analytics

## V1 revenue

1. Landlord subscriptions
2. Agent subscriptions
3. Company subscriptions
4. Featured listings
5. Advertising
6. Other platform promotional services

## Future extensibility (NOT in V1)

- Secure property-payment workflows / escrow
- Legal / document services
- Mortgage / financing integrations
- Property management
- Maintenance services
- Moving services
- More advertising products
- Business directories
- Advanced analytics
- Agent CRM / Property-owner CRM
- Digital contracts
- Additional payment providers
