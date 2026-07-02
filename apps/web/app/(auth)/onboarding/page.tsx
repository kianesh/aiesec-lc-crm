import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "../../../lib/auth";
import { createLocalCommittee } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/onboarding");
  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) redirect("/dashboard");

  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <span className="brand-squares" aria-hidden>
          <span /><span /><span /><span /><span /><span /><span />
        </span>
        <span className="auth-logo">
          <img src="/assets/aiesec-human-white.png" alt="AIESEC" />
        </span>
        <span className="eyebrow">Create LC</span>
        <h1>
          Start with your <span className="hl">Local Committee</span>.
        </h1>
        <p>This creates your LC workspace, scopes all future records to it, and makes you the owner.</p>
      </section>
      <section className="auth-card">
        <span className="eyebrow">LC setup</span>
        <h2>
          Create your <span className="hl">LC</span>
        </h2>
        <p>Add the operational identity. You can connect EXPA from Integrations after creation.</p>
        <form action={createLocalCommittee}>
          <label>
            LC name
            <input name="name" placeholder="AIESEC Western" required />
          </label>
          <label>
            Country
            <input name="country" placeholder="Canada" required />
          </label>
          <label>
            EXPA committee ID
            <input name="expaCommitteeId" placeholder="Optional" />
          </label>
          <button className="button primary wide" type="submit">Create LC workspace</button>
        </form>
      </section>
    </main>
  );
}
