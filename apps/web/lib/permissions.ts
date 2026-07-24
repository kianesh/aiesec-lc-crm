// Per-LC customizable capability model.
//
// The AIESEC *structure* is fixed (LCP > LCVP > Team Leader > Member), but each
// LC decides which capabilities each position holds. Capabilities are checked
// in the app layer via `can()`; the coarse owner/admin/member `role` still
// drives DB-level RLS. Owner (role) and LCP (position) always keep full access
// as a safety net so an LC can never lock itself out.

export type Capability =
  | "manage_members"
  | "manage_permissions"
  | "manage_lc"
  | "manage_integrations"
  | "manage_booking"
  | "manage_contacts"
  | "send_campaigns"
  | "view_analytics";

export type Position = "lcp" | "lcvp" | "team_leader" | "member";

export const POSITIONS: Position[] = ["lcp", "lcvp", "team_leader", "member"];

export const POSITION_LABELS: Record<Position, string> = {
  lcp: "LCP",
  lcvp: "LCVP",
  team_leader: "Team Leader",
  member: "Member"
};

export const CAPABILITIES: { key: Capability; label: string; description: string }[] = [
  { key: "manage_members", label: "Manage members", description: "Invite people, approve join requests, set positions & reporting lines." },
  { key: "manage_permissions", label: "Manage permissions", description: "Edit what each position (LCVP, TL, Member) is allowed to do." },
  { key: "manage_lc", label: "Edit LC settings", description: "Change the LC name, school, identifier and EXPA committee ID." },
  { key: "manage_integrations", label: "Manage integrations", description: "Connect or disconnect EXPA, Google and other integrations." },
  { key: "manage_booking", label: "Manage booking", description: "Edit appointment types, availability and cancel appointments." },
  { key: "manage_contacts", label: "Manage contacts", description: "Create, edit and delete contacts and pipeline records." },
  { key: "send_campaigns", label: "Send campaigns", description: "Create and send email & social campaigns." },
  { key: "view_analytics", label: "View analytics", description: "View EXPA analytics and dashboard insights." }
];

export const ALL_CAPABILITIES: Capability[] = CAPABILITIES.map((c) => c.key);

// Sensible starting matrix an LC can then customize.
export const DEFAULT_MATRIX: Record<Position, Capability[]> = {
  lcp: [...ALL_CAPABILITIES],
  lcvp: ["manage_members", "manage_integrations", "manage_booking", "manage_contacts", "send_campaigns", "view_analytics"],
  team_leader: ["manage_booking", "manage_contacts", "send_campaigns", "view_analytics"],
  member: ["view_analytics"]
};

// Management capabilities a role-level admin always keeps, so workspace admins
// invited via Settings are never locked out regardless of their position.
const ADMIN_FLOOR: Capability[] = ["manage_members", "manage_permissions", "manage_lc", "manage_integrations"];

export type PermissionMatrix = Record<Position, Capability[]>;

// Coerce arbitrary stored JSON into a well-formed matrix, falling back to
// defaults for any missing/invalid position.
export function normalizeMatrix(raw: unknown): PermissionMatrix {
  const source = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ?? {};
  const out = {} as PermissionMatrix;
  for (const pos of POSITIONS) {
    const val = source[pos];
    if (Array.isArray(val)) {
      const caps = val.filter((c): c is Capability => ALL_CAPABILITIES.includes(c as Capability));
      out[pos] = Array.from(new Set(caps));
    } else {
      out[pos] = [...DEFAULT_MATRIX[pos]];
    }
  }
  return out;
}

// Effective capability set for a member given their role, position and the LC matrix.
export function effectiveCapabilities(
  member: { role: "owner" | "admin" | "member"; position: Position },
  matrix: PermissionMatrix
): Set<Capability> {
  if (member.role === "owner" || member.position === "lcp") {
    return new Set(ALL_CAPABILITIES);
  }
  const base = new Set(matrix[member.position] ?? DEFAULT_MATRIX[member.position]);
  if (member.role === "admin") {
    for (const cap of ADMIN_FLOOR) base.add(cap);
  }
  return base;
}

export function can(caps: Set<Capability>, capability: Capability): boolean {
  return caps.has(capability);
}
