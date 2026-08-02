import type { MeResponse } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { authed } from "../../../../../lib/api/route";
import { corsPreflight, jsonOk } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

// Identity + workspace bootstrap. The app calls this on launch and after every
// LC switch; everything else in the UI is keyed off the response.
export const GET = authed(async (_request, session) => {
  const db = getDb();
  const [profile] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      fullName: schema.users.fullName,
      avatarUrl: schema.users.avatarUrl,
      title: schema.users.title
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  const body: MeResponse = {
    user: {
      id: session.userId,
      email: profile?.email ?? session.email,
      // The profile row is created at web sign-in; a mobile-first user may not
      // have one yet, so fall back to the token's email rather than 404.
      fullName: profile?.fullName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      title: profile?.title ?? null
    },
    memberships: session.memberships,
    activeMembership: session.membership,
    capabilities: [...session.capabilities]
  };

  return jsonOk(body);
});
