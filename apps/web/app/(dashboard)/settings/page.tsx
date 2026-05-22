import { inviteMember, signOut } from "../actions";

export default function SettingsPage({
  searchParams
}: {
  searchParams: { invited?: string; token?: string; error?: string };
}) {
  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Team and workspace</h1>
          <p>Invite LC members and manage the authenticated workspace.</p>
        </div>
        <form action={signOut}>
          <button className="button secondary" type="submit">Sign out</button>
        </form>
      </section>

      <section className="placeholder-grid">
        <article className="card compact-card">
          <h2>Invite member</h2>
          {searchParams.invited && (
            <p className="success-note">
              Invitation created for {searchParams.invited}. Development invite link: /invite/{searchParams.token}
            </p>
          )}
          {searchParams.error && <p className="form-error">{searchParams.error}</p>}
          <form action={inviteMember}>
            <label>
              Email
              <input name="email" type="email" placeholder="member@aiesec.ca" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="member">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <button className="button primary" type="submit">Create invite</button>
          </form>
        </article>
      </section>
    </div>
  );
}
