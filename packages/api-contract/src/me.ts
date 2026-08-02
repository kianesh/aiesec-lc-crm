import type { Capability, LcRole, Position } from "./enums";

export type MembershipDto = {
  lcId: string;
  lcName: string;
  role: LcRole;
  position: Position;
};

export type MeResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    title: string | null;
  };
  memberships: MembershipDto[];
  /** The LC the rest of the response (and any un-scoped request) applies to. */
  activeMembership: MembershipDto;
  capabilities: Capability[];
};
