import { FileText } from "lucide-react";
import Link from "next/link";
import { getDb } from "../lib/db";
import { readIntegration } from "../lib/connectors/store";
import { getGoogleAccessToken, getGoogleForm, listGoogleFormResponses } from "../lib/connectors/google";

// Async server component: most recent interest-form submissions.
export async function DashboardForms({ lcId }: { lcId: string }) {
  const db = getDb();
  const google = await readIntegration(db, lcId, "google_drive").catch(() => null);
  const forms = ((google?.config as { forms?: { id: string; title: string }[] })?.forms) ?? [];

  const header = (
    <div className="forms-head">
      <span className="eyebrow"><FileText size={13} /> Recent form responses</span>
      <Link href="/integrations/google" className="muted-note" style={{ fontSize: 12 }}>Manage forms</Link>
    </div>
  );

  if (!google) {
    return (
      <section className="card" style={{ padding: 20 }}>
        {header}
        <p className="muted-note" style={{ marginTop: 8 }}>
          <Link href="/integrations/google">Connect Google</Link> and track a form to see submissions here.
        </p>
      </section>
    );
  }
  if (forms.length === 0) {
    return (
      <section className="card" style={{ padding: 20 }}>
        {header}
        <p className="muted-note" style={{ marginTop: 8 }}>
          No forms tracked yet. <Link href="/integrations/google">Track your interest form</Link> to pull responses.
        </p>
      </section>
    );
  }

  let rows: { responseId: string; submittedAt: string | null; answers: Record<string, string>; formTitle: string }[] = [];
  let failed = false;
  try {
    const token = await getGoogleAccessToken(db, lcId);
    // Pull the two most-recently-tracked forms and merge their latest responses.
    const picked = forms.slice(0, 2);
    const perForm = await Promise.all(
      picked.map(async (f) => {
        const form = await getGoogleForm(token, f.id);
        const responses = await listGoogleFormResponses(token, form);
        return responses.map((r) => ({ ...r, formTitle: form.title }));
      })
    );
    rows = perForm
      .flat()
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
      .slice(0, 6);
  } catch {
    failed = true;
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      {header}
      {failed ? (
        <p className="form-error" style={{ marginTop: 10 }}>
          Couldn’t load responses. <Link href="/integrations/google">Reconnect Google</Link> (the token may have expired).
        </p>
      ) : rows.length === 0 ? (
        <p className="muted-note" style={{ marginTop: 10 }}>No responses yet.</p>
      ) : (
        <ul className="forms-list">
          {rows.map((r) => {
            const primary = Object.values(r.answers)[0] || "Response";
            const secondary = Object.values(r.answers).slice(1, 3).filter(Boolean).join(" · ");
            return (
              <li key={r.responseId}>
                <div className="forms-avatar"><FileText size={13} /></div>
                <div className="forms-body">
                  <strong>{primary}</strong>
                  {secondary && <span className="muted-note">{secondary}</span>}
                </div>
                <div className="forms-meta">
                  <span className="muted-note">{r.formTitle}</span>
                  {r.submittedAt && (
                    <span className="forms-time">{new Date(r.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
