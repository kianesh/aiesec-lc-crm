import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { updateProfile } from "./actions";

export const dynamic = "force-dynamic";

const POSITION_LABELS: Record<string, string> = {
  lcp: "LCP · Local Committee President",
  lcvp: "LCVP · Vice President",
  team_leader: "Team Leader",
  member: "Member"
};
const PORTFOLIO_LABELS: Record<string, string> = {
  b2c: "B2C · Marketing",
  ogv: "oGV · Global Volunteer",
  ogt: "oGT · Global Talent",
  finance: "Finance",
  tm: "TM · Talent Management"
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

export default async function ProfilePage({ searchParams }: { searchParams: { saved?: string } }) {
  const { user, activeMembership } = await requireMembership();
  const db = getDb();
  const manager = alias(schema.users, "manager");

  const [profile] = await db
    .select({
      fullName: schema.users.fullName,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      phone: schema.users.phone,
      title: schema.users.title,
      bio: schema.users.bio,
      role: schema.lcMembers.role,
      position: schema.lcMembers.position,
      portfolio: schema.lcMembers.portfolio,
      managerName: manager.fullName
    })
    .from(schema.users)
    .leftJoin(
      schema.lcMembers,
      and(eq(schema.lcMembers.userId, schema.users.id), eq(schema.lcMembers.lcId, activeMembership.lcId))
    )
    .leftJoin(manager, eq(schema.lcMembers.managerId, manager.id))
    .where(eq(schema.users.id, user.id))
    .limit(1);

  const name = profile?.fullName || user.email || "You";

  return (
    <div className="content">
      {searchParams.saved && <p className="success-note page-note">Profile updated.</p>}

      <section className="profile-hero card">
        <span className="profile-avatar">
          {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials(name)}
        </span>
        <div className="profile-hero-body">
          <h1>{name}</h1>
          {profile?.title && <p className="profile-title">{profile.title}</p>}
          <div className="profile-meta">
            <span><Mail size={13} /> {profile?.email}</span>
            {profile?.phone && <span><Phone size={13} /> {profile.phone}</span>}
            <span><ShieldCheck size={13} /> {activeMembership.role}</span>
          </div>
        </div>
        <div className="profile-org">
          <div className="scope-row"><span>Position</span><strong>{POSITION_LABELS[profile?.position ?? "member"]}</strong></div>
          <div className="scope-row"><span>Portfolio</span><strong>{profile?.portfolio ? PORTFOLIO_LABELS[profile.portfolio] : "—"}</strong></div>
          <div className="scope-row"><span>Reports to</span><strong>{profile?.managerName ?? "—"}</strong></div>
          <div className="scope-row"><span>Workspace</span><strong>{activeMembership.lcName}</strong></div>
        </div>
      </section>

      <section className="page-heading" style={{ marginTop: 20 }}>
        <div>
          <span className="eyebrow">Account</span>
          <h1 style={{ fontSize: 22 }}>Edit your details</h1>
          <p>Update your personal information. Position and team are managed on the Organization page.</p>
        </div>
      </section>

      <article className="card" style={{ padding: 24, maxWidth: 620 }}>
        <form action={updateProfile} className="stacked-form">
          <label>Full name<input name="fullName" defaultValue={profile?.fullName ?? ""} required maxLength={120} /></label>
          <label>Title / headline<input name="title" defaultValue={profile?.title ?? ""} maxLength={120} placeholder="e.g. VP Outgoing Global Volunteer" /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={profile?.phone ?? ""} maxLength={40} /></label>
          <label>Avatar URL<input name="avatarUrl" type="url" defaultValue={profile?.avatarUrl ?? ""} placeholder="https://…" /></label>
          <label>Bio<textarea name="bio" rows={3} defaultValue={profile?.bio ?? ""} maxLength={600} /></label>
          <div className="form-actions">
            <button className="button primary" type="submit">Save changes</button>
          </div>
        </form>
      </article>
    </div>
  );
}
