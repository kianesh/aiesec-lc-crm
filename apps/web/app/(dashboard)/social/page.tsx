import { schema } from "@aiesec/db";
import { desc, eq } from "drizzle-orm";
import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { markPublished, deletePost } from "./actions";

type SearchParams = { status?: string; error?: string };

const STATUS_BADGE: Record<string, string> = {
  draft: "badge badge-grey",
  scheduled: "badge badge-blue",
  published: "badge badge-green",
  failed: "badge badge-pink"
};

const PLATFORM_BADGE: Record<string, string> = {
  instagram: "badge badge-pink",
  facebook: "badge badge-blue",
  linkedin: "badge badge-blue",
  tiktok: "badge badge-grey"
};

export default async function SocialPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();

  const allPosts = await db
    .select()
    .from(schema.socialPosts)
    .where(eq(schema.socialPosts.lcId, activeMembership.lcId))
    .orderBy(desc(schema.socialPosts.scheduledFor));

  const filter = searchParams.status;
  const posts = filter ? allPosts.filter((p) => p.status === filter) : allPosts;

  const counts = { draft: 0, scheduled: 0, published: 0, failed: 0 } as Record<string, number>;
  for (const p of allPosts) counts[p.status] = (counts[p.status] ?? 0) + 1;

  return (
    <div className="content">
      {searchParams.error === "not_allowed" && (
        <p className="form-error page-note">Only owners and admins can delete posts.</p>
      )}
      <section className="page-heading">
        <div>
          <span className="eyebrow">Marketing</span>
          <h1>Social Planner</h1>
          <p>Plan and track content across platforms. Publish manually when ready.</p>
        </div>
        <div className="heading-actions">
          <Link href="/social/new" className="button primary"><Plus size={13} /> New post</Link>
        </div>
      </section>

      <div className="platform-tabs">
        {([["", "All"], ["draft", "Drafts"], ["scheduled", "Scheduled"], ["published", "Published"]] as [string, string][]).map(([val, label]) => (
          <Link
            key={val}
            href={val ? `/social?status=${val}` : "/social"}
            className={`platform-tab${(!filter && !val) || filter === val ? " active" : ""}`}
          >
            {label} <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 11 }}>{val ? counts[val] ?? 0 : allPosts.length}</span>
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <CalendarDays size={28} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
          <p className="muted-note">No posts yet. Create your first one to get started.</p>
          <Link href="/social/new" className="button primary" style={{ marginTop: 14, display: "inline-flex" }}><Plus size={13} /> New post</Link>
        </div>
      ) : (
        <div className="posts-grid">
          {posts.map((post) => {
            const content = post.content as { caption?: string };
            const deleteWithId = deletePost.bind(null, post.id);
            const markWithId = markPublished.bind(null, post.id);
            return (
              <article key={post.id} className="card post-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  {post.title && <strong style={{ fontSize: 13 }}>{post.title}</strong>}
                  <span className={STATUS_BADGE[post.status] ?? "badge badge-grey"}>{post.status}</span>
                </div>
                <div className="post-platforms">
                  {post.platforms.map((p) => (
                    <span key={p} className={PLATFORM_BADGE[p] ?? "badge badge-grey"}>{p}</span>
                  ))}
                </div>
                <p className="post-caption">{content.caption ?? ""}</p>
                <div className="post-footer">
                  <span>
                    {post.scheduledFor
                      ? post.scheduledFor.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "No date set"}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {post.status !== "published" && (
                      <form action={markWithId} style={{ display: "inline" }}>
                        <button className="button ghost" type="submit" style={{ fontSize: 11 }}>Mark published</button>
                      </form>
                    )}
                    <form action={deleteWithId} style={{ display: "inline" }}>
                      <button className="button ghost danger" type="submit" style={{ fontSize: 11 }}>Delete</button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
