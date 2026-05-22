import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { acceptInvitation } from "./actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=/invite/${params.token}`);

  const db = getDb();
  const [invite] = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      acceptedAt: schema.invitations.acceptedAt,
      expiresAt: schema.invitations.expiresAt,
      lcName: schema.localCommittees.name,
      country: schema.localCommittees.country
    })
    .from(schema.invitations)
    .innerJoin(schema.localCommittees, eq(schema.invitations.lcId, schema.localCommittees.id))
    .where(eq(schema.invitations.token, params.token))
    .limit(1);

  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <span className="auth-logo">
          <img src="/assets/aiesec-human-white.png" alt="" />
        </span>
        <span className="eyebrow">Invitation</span>
        <h1>Join your LC workspace.</h1>
        <p>Invitation acceptance validates your email and adds your user to LC membership.</p>
      </section>
      <section className="auth-card">
        <span className="eyebrow">Accept invitation</span>
        <h2>{invite ? invite.lcName : "Invitation not found"}</h2>
        {searchParams.error && <p className="form-error">Unable to accept invitation: {searchParams.error}</p>}
        {invite ? (
          <>
            <p>{invite.lcName} in {invite.country} invited {invite.email} as {invite.role}.</p>
            <form action={acceptInvitation}>
              <input type="hidden" name="token" value={params.token} />
              <button className="button primary wide" type="submit" disabled={Boolean(invite.acceptedAt)}>
                {invite.acceptedAt ? "Invitation already accepted" : "Accept invitation"}
              </button>
            </form>
          </>
        ) : (
          <a className="button secondary wide" href="/dashboard">Back to dashboard</a>
        )}
      </section>
    </main>
  );
}
