import { Mail, ShieldCheck } from "lucide-react";
import { signInWithGoogle, signInWithMagicLink } from "./actions";

export default function SignInPage({
  searchParams
}: {
  searchParams: { next?: string; sent?: string; error?: string };
}) {
  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <span className="brand-squares" aria-hidden>
          <span /><span /><span /><span /><span /><span /><span />
        </span>
        <span className="auth-logo">
          <img src="/assets/aiesec-human-white.png" alt="AIESEC" />
        </span>
        <span className="eyebrow">AIESEC Western CRM</span>
        <h1>
          Run your LC from one shared <span className="hl">workspace</span>.
        </h1>
        <p>Sign in, create your Local Committee, invite teammates, and connect EXPA when you’re ready.</p>
        <div className="trust-strip">
          <span><ShieldCheck size={15} /> Supabase Auth</span>
          <span><Mail size={15} /> Magic links</span>
        </div>
      </section>

      <section className="auth-card">
        <span className="eyebrow">Sign in</span>
        <h2>
          Welcome <span className="hl">back</span>
        </h2>
        {searchParams.sent ? (
          <p>Magic link sent to {searchParams.sent}. Open that email to continue.</p>
        ) : (
          <p>Enter your AIESEC email and we’ll send a secure magic link.</p>
        )}
        {searchParams.error && <p className="form-error">{searchParams.error}</p>}
        <form action={signInWithMagicLink}>
          <input type="hidden" name="next" value={searchParams.next ?? "/dashboard"} />
          <label>
            Email
            <input name="email" type="email" placeholder="lina@aiesec.ca" required />
          </label>
          <button className="button primary wide" type="submit">Send magic link</button>
        </form>
        <div className="auth-divider">or</div>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={searchParams.next ?? "/dashboard"} />
          <button className="button secondary wide" type="submit">Continue with Google</button>
        </form>
        <div className="auth-options">
          <a href="/onboarding">
            <strong>Create LC</strong>
            <small>Set up brand, EXPA ID, and teammates</small>
          </a>
          <a href="/invite/demo">
            <strong>Accept invite</strong>
            <small>Use an invitation token from your email</small>
          </a>
        </div>
      </section>
    </main>
  );
}
