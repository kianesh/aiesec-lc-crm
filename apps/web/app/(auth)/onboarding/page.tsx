import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { Clock, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships, getPendingJoinRequest } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getSiteUrl } from "../../../lib/site-url";
import { signOutFromOnboarding, withdrawJoinRequest } from "./actions";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/onboarding");

  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) redirect("/dashboard");

  const db = getDb();
  const [profile] = await db
    .select({ fullName: schema.users.fullName, title: schema.users.title, phone: schema.users.phone })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  const pending = await getPendingJoinRequest(user.id);

  return (
    <main className="onboarding-screen">
      <div className="onboarding-bg" aria-hidden>
        <span className="brand-squares">
          <span /><span /><span /><span /><span /><span /><span />
        </span>
      </div>

      <div className="onboarding-topbar">
        <span className="onboarding-logo">
          <img src="/assets/aiesec-human-white.png" alt="AIESEC" />
        </span>
        <form action={signOutFromOnboarding}>
          <button type="submit" className="onboarding-signout">
            <LogOut size={14} /> Sign out
          </button>
        </form>
      </div>

      <div className="onboarding-card">
        {pending ? (
          <div className="wizard">
            <div className="wizard-step wizard-centered">
              <span className="wizard-badge-icon"><Clock size={26} /></span>
              <h2>Waiting for approval</h2>
              <p className="wizard-sub">
                Your request to join <strong>{pending.lcName}</strong> is pending. An admin of that LC needs to approve you
                before you can enter the workspace.
              </p>
              <div className="wizard-actions wizard-actions-center">
                <form action={withdrawJoinRequest}>
                  <button type="submit" className="button ghost">Cancel request &amp; choose again</button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <OnboardingWizard
            initialProfile={{
              fullName: profile?.fullName ?? ((user.user_metadata?.full_name as string | undefined) || ""),
              title: profile?.title ?? "",
              phone: profile?.phone ?? ""
            }}
            siteUrl={getSiteUrl()}
          />
        )}
      </div>

      <p className="onboarding-footer">AIESEC CRM · Outgoing Exchange</p>
    </main>
  );
}
