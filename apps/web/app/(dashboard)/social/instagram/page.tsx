import { Heart, Instagram, MessageCircle, Send } from "lucide-react";
import Link from "next/link";
import { requireMembership } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { readIntegration } from "../../../../lib/connectors/store";
import { getIgRecentMedia, getInstagramAuth, type IgMediaItem } from "../../../../lib/connectors/instagram";
import { publishToInstagram } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = { published?: string; error?: string };

const ERRORS: Record<string, string> = {
  not_allowed: "Only owners and admins can publish.",
  bad_image: "Enter a public https image URL.",
  not_connected: "Instagram isn’t connected. Connect it in Integrations.",
  publish_failed: "Couldn’t publish. Check the image URL is public and try again."
};

export default async function InstagramPostsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeMembership } = await requireMembership();
  const db = getDb();
  const meta = await readIntegration(db, activeMembership.lcId, "meta").catch(() => null);

  let media: IgMediaItem[] = [];
  let username: string | null = (meta?.config as { username?: string })?.username ?? null;
  let loadFailed = false;
  if (meta) {
    try {
      const { token, igUserId } = await getInstagramAuth(db, activeMembership.lcId);
      media = await getIgRecentMedia(token, igUserId, 24);
    } catch {
      loadFailed = true;
    }
  }

  return (
    <div className="content">
      {searchParams.published && <p className="success-note page-note">Published to Instagram.</p>}
      {searchParams.error && <p className="form-error page-note">{ERRORS[searchParams.error] ?? "Something went wrong."}</p>}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Social</span>
          <h1>Instagram</h1>
          <p>{username ? `@${username}` : "Your posts"} · publish and review your feed.</p>
        </div>
      </section>

      {!meta ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Instagram size={26} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
          <p className="muted-note"><Link href="/integrations/instagram">Connect Instagram</Link> to publish posts and see your feed.</p>
        </div>
      ) : (
        <>
          <article className="card" style={{ padding: 20, marginBottom: 20 }}>
            <span className="eyebrow"><Send size={13} style={{ verticalAlign: -2 }} /> New post</span>
            <form action={publishToInstagram} className="settings-form" style={{ marginTop: 10 }}>
              <label className="book-field">
                <span>Image URL (public https)</span>
                <input name="imageUrl" type="url" placeholder="https://…/photo.jpg" required />
                <small className="muted-note">Instagram fetches the image from a public URL — it must be reachable (e.g. Drive/CDN direct link).</small>
              </label>
              <label className="book-field">
                <span>Caption</span>
                <textarea name="caption" rows={3} maxLength={2200} placeholder="Write a caption…" />
              </label>
              <button type="submit" className="button primary"><Send size={14} /> Publish to Instagram</button>
            </form>
          </article>

          <span className="eyebrow">Your posts</span>
          {loadFailed ? (
            <p className="form-error page-note">Couldn’t load your feed. <Link href="/integrations/instagram">Reconnect Instagram</Link>.</p>
          ) : media.length === 0 ? (
            <p className="muted-note page-note">No posts yet.</p>
          ) : (
            <div className="ig-feed-grid">
              {media.map((m) => (
                <a key={m.id} href={m.permalink ?? "#"} target="_blank" rel="noreferrer" className="ig-feed-item" title={m.caption ?? ""}>
                  {m.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="ig-media-fallback"><Instagram size={20} /></span>
                  )}
                  <span className="ig-feed-overlay">
                    <span><Heart size={13} /> {m.likeCount}</span>
                    <span><MessageCircle size={13} /> {m.commentsCount}</span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
