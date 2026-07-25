export const POSITION_LABELS: Record<string, string> = {
  lcp: "LCP",
  lcvp: "LCVP",
  team_leader: "Team Leader",
  member: "Member"
};
export const POSITION_ORDER: Record<string, number> = { lcp: 0, lcvp: 1, team_leader: 2, member: 3 };
export const POSITION_BADGE: Record<string, string> = {
  lcp: "badge badge-blue",
  lcvp: "badge badge-violet",
  team_leader: "badge badge-teal",
  member: "badge badge-grey"
};

// Functional portfolios the LC org is built around (LCP oversees all).
export const PORTFOLIOS = ["b2c", "ogv", "ogt", "finance", "tm"] as const;
export const PORTFOLIO_LABELS: Record<string, string> = {
  b2c: "B2C · Marketing",
  ogv: "oGV · Global Volunteer",
  ogt: "oGT · Global Talent",
  finance: "Finance",
  tm: "TM · Talent Management"
};

export type Member = {
  id: string;
  userId: string;
  role: string;
  position: string;
  portfolio: string | null;
  managerId: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

export function sortMembers(a: Member, b: Member) {
  return (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9) || a.name.localeCompare(b.name);
}

export const ORG_ERRORS: Record<string, string> = {
  not_allowed: "You don’t have permission to do that.",
  identifier_taken: "That LC ID is already in use. Pick a different one.",
  bad_matrix: "Permissions could not be saved. Try again.",
  bad_invite: "That invite couldn’t be sent. Check the email address.",
  missing_committee: "Add an EXPA committee ID first.",
  expa_no_app_creds: "EXPA app credentials aren’t configured on the server.",
  expa_token_failed: "Couldn’t reach EXPA to generate a token. Try again."
};
