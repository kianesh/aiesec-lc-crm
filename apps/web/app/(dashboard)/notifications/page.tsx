import { Bell, Check, UserPlus, X } from "lucide-react";
import { requireMembership } from "../../../lib/auth";
import { getNotifications } from "../../../lib/notifications";
import { approveJoinRequest, rejectJoinRequest } from "./actions";

export const dynamic = "force-dynamic";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function NotificationsPage() {
  const { user, memberships } = await requireMembership();
  const notifications = await getNotifications(user.id);
  const multiLc = memberships.length > 1;

  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Inbox</span>
          <h1>Notifications</h1>
          <p>Requests and updates that need your attention.</p>
        </div>
      </section>

      {notifications.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Bell size={26} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
          <p className="muted-note">You’re all caught up — no pending notifications.</p>
        </div>
      ) : (
        <ul className="notif-list">
          {notifications.map((n) => (
            <li key={n.id} className="card notif-item">
              <span className="notif-icon"><UserPlus size={16} /></span>
              <div className="notif-body">
                <p className="notif-title">
                  <strong>{n.actorName}</strong> requested to join{multiLc ? <> <strong>{n.lcName}</strong></> : null}
                </p>
                <p className="notif-sub">
                  {n.actorEmail} · {timeAgo(n.createdAt)}
                </p>
              </div>
              <div className="notif-actions">
                <form action={approveJoinRequest.bind(null, n.requestId)}>
                  <button type="submit" className="button primary"><Check size={14} /> Approve</button>
                </form>
                <form action={rejectJoinRequest.bind(null, n.requestId)}>
                  <button type="submit" className="button ghost danger"><X size={14} /> Reject</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
