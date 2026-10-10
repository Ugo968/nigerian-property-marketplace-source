import { describe, it, expect } from "bun:test";
import {
  STATUS_TRANSITIONS,
  TRANSITION_ACTORS,
  canTransition,
  explainTransition,
  isPubliclyVisible,
  isTaken,
} from "@/lib/properties/status-machine";
import type { ListingStatus } from "@/types";

describe("property status machine — valid transitions", () => {
  it("draft can be published (→ available)", () => {
    expect(canTransition("draft", "available", "owner")).toBe(true);
    expect(canTransition("draft", "available", "company_staff")).toBe(true);
  });

  it("draft can be removed by owner", () => {
    expect(canTransition("draft", "removed", "owner")).toBe(true);
  });

  it("available can transition to rented or sold", () => {
    expect(canTransition("available", "rented", "owner")).toBe(true);
    expect(canTransition("available", "sold", "owner")).toBe(true);
  });

  it("available can transition to application_pending (by system)", () => {
    expect(canTransition("available", "application_pending", "system")).toBe(true);
  });

  it("available can be suspended (by admin)", () => {
    expect(canTransition("available", "suspended", "admin")).toBe(true);
    expect(canTransition("available", "suspended", "owner")).toBe(false);
  });

  it("rented can go back to available", () => {
    expect(canTransition("rented", "available", "owner")).toBe(true);
  });

  it("removed → available requires admin (per spec Section 23)", () => {
    expect(canTransition("removed", "available", "admin")).toBe(true);
    expect(canTransition("removed", "available", "owner")).toBe(false);
  });

  it("suspended → available requires admin", () => {
    expect(canTransition("suspended", "available", "admin")).toBe(true);
    expect(canTransition("suspended", "available", "owner")).toBe(false);
  });
});

describe("property status machine — invalid transitions", () => {
  it("cannot transition from a terminal state without admin", () => {
    expect(canTransition("removed", "available", "owner")).toBe(false);
    expect(canTransition("suspended", "available", "owner")).toBe(false);
  });

  it("agent cannot publish (only owner / company_staff)", () => {
    expect(canTransition("draft", "available", "agent")).toBe(false);
  });

  it("cannot transition to an invalid status", () => {
    expect(canTransition("draft", "nonexistent" as ListingStatus, "owner")).toBe(false);
  });

  it("cannot transition from removed to application_pending by owner", () => {
    expect(canTransition("removed", "application_pending", "owner")).toBe(false);
  });

  it("cannot transition from sold back to draft (not allowed for any role)", () => {
    expect(canTransition("sold", "draft", "owner")).toBe(false);
    expect(canTransition("sold", "draft", "admin")).toBe(false);
  });
});

describe("explainTransition", () => {
  it("explains why an invalid transition is rejected", () => {
    const msg = explainTransition("removed", "available");
    expect(msg).toContain("admin");
  });

  it("explains when target status is not in the transition list", () => {
    const msg = explainTransition("draft", "nonexistent" as ListingStatus);
    expect(msg).toContain("Cannot transition");
  });
});

describe("isPubliclyVisible", () => {
  it("returns true for available", () => {
    expect(isPubliclyVisible("available")).toBe(true);
  });

  it("returns true for application_pending, under_offer, rented, sold", () => {
    expect(isPubliclyVisible("application_pending")).toBe(true);
    expect(isPubliclyVisible("under_offer")).toBe(true);
    expect(isPubliclyVisible("rented")).toBe(true);
    expect(isPubliclyVisible("sold")).toBe(true);
  });

  it("returns false for draft", () => {
    expect(isPubliclyVisible("draft")).toBe(false);
  });

  it("returns false for suspended and removed", () => {
    expect(isPubliclyVisible("suspended")).toBe(false);
    expect(isPubliclyVisible("removed")).toBe(false);
  });

  it("returns false for unavailable", () => {
    expect(isPubliclyVisible("unavailable")).toBe(false);
  });
});

describe("isTaken", () => {
  it("returns true for rented and sold", () => {
    expect(isTaken("rented")).toBe(true);
    expect(isTaken("sold")).toBe(true);
  });

  it("returns false for available and other statuses", () => {
    expect(isTaken("available")).toBe(false);
    expect(isTaken("draft")).toBe(false);
    expect(isTaken("application_pending")).toBe(false);
    expect(isTaken("under_offer")).toBe(false);
  });
});

describe("transition coverage", () => {
  it("every status has a transitions array entry", () => {
    const allStatuses: ListingStatus[] = [
      "draft",
      "available",
      "application_pending",
      "under_offer",
      "rented",
      "sold",
      "unavailable",
      "suspended",
      "removed",
    ];
    for (const status of allStatuses) {
      expect(STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(STATUS_TRANSITIONS[status])).toBe(true);
    }
  });
});
