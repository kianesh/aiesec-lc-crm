import Link from "next/link";
import { createPost } from "../actions";

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" }
];

export default function NewPostPage() {
  return (
    <div className="content" style={{ maxWidth: 600 }}>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Social Planner</span>
          <h1>New post</h1>
        </div>
      </section>

      <article className="card compact-card">
        <form action={createPost} className="stacked-form">
          <label>
            Title (optional)
            <input name="title" placeholder="Oct campaign — week 1" />
          </label>
          <label>
            Caption <span style={{ color: "var(--brand-danger)" }}>*</span>
            <textarea name="caption" rows={5} required placeholder="Write your post caption…" style={{ width: "100%", border: "1px solid var(--brand-border)", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 13, resize: "vertical" }} />
          </label>
          <fieldset style={{ border: "1px solid var(--brand-border)", borderRadius: 8, padding: "12px 14px" }}>
            <legend style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 12, padding: "0 4px" }}>
              Platforms <span style={{ color: "var(--brand-danger)" }}>*</span>
            </legend>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
              {PLATFORMS.map((p) => (
                <label key={p.value} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" name="platforms" value={p.value} />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Schedule for (optional)
            <input name="scheduledFor" type="datetime-local" />
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit">Save post</button>
            <Link href="/social" className="button ghost">Cancel</Link>
          </div>
        </form>
      </article>
    </div>
  );
}
