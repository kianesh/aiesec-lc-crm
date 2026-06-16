import Link from "next/link";
import { createContact } from "../actions";

export default function NewContactPage() {
  return (
    <div className="content" style={{ maxWidth: 600 }}>
      <section className="page-heading">
        <div>
          <span className="eyebrow">CRM</span>
          <h1>New contact</h1>
        </div>
      </section>

      <article className="card compact-card">
        <form action={createContact} className="stacked-form">
          <label>
            Full name <span style={{ color: "var(--brand-danger)" }}>*</span>
            <input name="fullName" type="text" required placeholder="Jane Smith" />
          </label>
          <label>
            Email
            <input name="email" type="email" placeholder="jane@example.com" />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" placeholder="+1 (519) 000-0000" />
          </label>
          <label>
            Contact type
            <select name="type" defaultValue="candidate">
              <option value="candidate">Candidate (Exchange Participant)</option>
              <option value="company">Company (TN Host)</option>
              <option value="lc_partner">LC Partner</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Funnel stage
            <select name="funnelStage" defaultValue="">
              <option value="">Not set</option>
              <option value="sign_up">Sign up</option>
              <option value="applied">Applied</option>
              <option value="matched">Matched</option>
              <option value="approved">Approved</option>
              <option value="realized">Realized</option>
              <option value="finished">Finished</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            Programme
            <select name="programme" defaultValue="">
              <option value="">Not set</option>
              <option value="gt">Global Talent (GT)</option>
              <option value="ge">Global Entrepreneur (GE)</option>
              <option value="gv">Global Volunteer (GV)</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Nationality
            <input name="nationality" type="text" placeholder="Canadian" />
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit">Create contact</button>
            <Link href="/contacts" className="button ghost">Cancel</Link>
          </div>
        </form>
      </article>
    </div>
  );
}
