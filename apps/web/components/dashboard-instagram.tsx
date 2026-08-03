import { Eye, Heart, Instagram, MessageCircle, Play, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { getDb } from "../lib/db";
import { readIntegration } from "../lib/connectors/store";
import { getInstagramAuth, getInstagramInsights } from "../lib/connectors/instagram";

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Async server component: Instagram insights for the dashboard.
export async function DashboardInstagram({ lcId }: { lcId: string }) {
  const db = getDb();
  const meta = await readIntegration(db, lcId, "meta").catch(() => null);

  if (!meta) {
    return (
      <section className="card ig-widget" style={{ padding: 20 }}>
        <div className="ig-head"><span className="eyebrow"><Instagram size={13} /> Instagram</span></div>
        <p className="muted-note" style={{ marginTop: 8 }}>
          <Link href="/integrations/instagram">Connect Instagram</Link> to see followers, reach and recent posts.
        </p>
      </section>
    );
  }

  let insights: Awaited<ReturnType<typeof getInstagramInsights>> | null = null;
  let failed = false;
  try {
    const { token, igUserId } = await getInstagramAuth(db, lcId);
    insights = await getInstagramInsights(token, igUserId);
  } catch {
    failed = true;
  }

  return (
    <section className="card ig-widget" style={{ padding: 20 }}>
      <div className="ig-head">
        <span className="eyebrow"><Instagram size={13} /> Instagram</span>
        {insights?.username && <span className="ig-handle">@{insights.username}</span>}
      </div>

      {failed ? (
        <p className="form-error" style={{ marginTop: 10 }}>
          Couldn’t load Instagram data. <Link href="/integrations/instagram">Reconnect Instagram</Link>.
        </p>
      ) : (
        <>
          <div className="ig-stats">
            <div className="ig-stat"><Users size={15} /><strong>{fmt(insights?.followers ?? null)}</strong><span>Followers</span></div>
            <div className="ig-stat"><TrendingUp size={15} /><strong>{fmt(insights?.reach7d ?? null)}</strong><span>Reach · 7d</span></div>
            <div className="ig-stat"><Instagram size={15} /><strong>{fmt(insights?.mediaCount ?? null)}</strong><span>Posts</span></div>
          </div>

          {insights && insights.recentMedia.length > 0 && (
            <div className="ig-media">
              {insights.recentMedia.slice(0, 6).map((m) => (
                <a key={m.id} href={m.permalink ?? "#"} target="_blank" rel="noreferrer" className="ig-media-item" title={m.caption ?? ""}>
                  {m.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="ig-media-fallback"><Instagram size={16} /></span>
                  )}
                  <span className="ig-media-stats">
                    {/* Views lead for video and reels — that's the number that
                        actually says how a post did. Stills have no views
                        metric, so they fall back to reach. */}
                    {m.insights?.views != null ? (
                      <span title="Views"><Play size={11} /> {fmt(m.insights.views)}</span>
                    ) : m.insights?.reach != null ? (
                      <span title="Reach"><Eye size={11} /> {fmt(m.insights.reach)}</span>
                    ) : null}
                    <span title="Likes"><Heart size={11} /> {fmt(m.likeCount)}</span>
                    <span title="Comments"><MessageCircle size={11} /> {fmt(m.commentsCount)}</span>
                  </span>
                </a>
              ))}
            </div>
          )}
          {insights && insights.followers == null && insights.recentMedia.length === 0 && (
            <p className="muted-note" style={{ marginTop: 10 }}>
              Connected, but no insights returned yet — this needs the insights permission approved in App Review.
            </p>
          )}
        </>
      )}
    </section>
  );
}
