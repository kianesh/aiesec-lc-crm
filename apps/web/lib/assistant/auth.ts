import { getCurrentUser, getMemberships, type Membership } from "../auth";

export type AssistantSession = {
  userId: string;
  membership: Membership;
};

// API-route-safe auth (no redirects). Returns null when unauthenticated so the
// caller can respond 401 instead of throwing a NEXT_REDIRECT.
export async function getAssistantSession(lcId?: string): Promise<AssistantSession | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) return null;
  const membership = lcId ? memberships.find((m) => m.lcId === lcId) ?? memberships[0] : memberships[0];
  return { userId: user.id, membership };
}
