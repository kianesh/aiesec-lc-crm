import { Check, Sparkles } from "lucide-react";

export function EmptyRoute({
  eyebrow,
  title,
  text,
  items
}: {
  eyebrow: string;
  title: string;
  text: string;
  items: string[];
}) {
  return (
    <div className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{text}</p>
        </div>
      </section>
      <section className="placeholder-grid">
        <article className="card placeholder-card">
          <Sparkles size={22} />
          <h2>{title} is structured, but waiting for live data</h2>
          <p>This page is now a real route inside the protected app shell. The next implementation pass can add its workflow without changing the navigation or auth model.</p>
          <div className="skeleton-block" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </article>
        <article className="card compact-card">
          <h2>Scope</h2>
          {items.map((item) => (
            <div className="scope-row" key={item}>
              <Check size={14} />
              <span>{item}</span>
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}
