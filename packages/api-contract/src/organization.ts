import type { LcRole, Position } from "./enums";

// Functional portfolios the LC org is built around. Mirrors `lcPortfolioEnum`
// in the Drizzle schema; the LCP has none because they oversee all of them.
export const PORTFOLIOS = ["b2c", "ogv", "ogt", "finance", "tm"] as const;
export type Portfolio = (typeof PORTFOLIOS)[number];

export const PORTFOLIO_LABELS: Record<Portfolio, string> = {
  b2c: "B2C · Marketing",
  ogv: "oGV · Global Volunteer",
  ogt: "oGT · Global Talent",
  finance: "Finance",
  tm: "TM · Talent Management"
};

export type OrgMemberDto = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: LcRole;
  position: Position;
  portfolio: Portfolio | null;
  team: string | null;
  /** Another member's `id`, or null when they sit at the top of the chart. */
  managerId: string | null;
  joinedAt: string | null;
};

export type OrgLcDto = {
  id: string;
  name: string;
  country: string;
  stateProvince: string | null;
  school: string | null;
  lcIdentifier: string | null;
  expaCommitteeId: string | null;
};

export type OrganizationResponse = {
  lc: OrgLcDto;
  members: OrgMemberDto[];
  /** True when the caller may edit the roster — the phone only reads it. */
  canManageMembers: boolean;
};
