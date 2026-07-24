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
          <button className="button secondary wide google-button" type="submit">
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
        <p className="auth-fine-print">
          New here? Sign in and we’ll walk you through creating or joining your LC.
        </p>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
