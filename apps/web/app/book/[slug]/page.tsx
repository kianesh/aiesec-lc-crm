import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../lib/db";
import { getActiveAppointmentTypes, getBookingSettingsBySlug } from "../../../lib/booking/store";
import { TypeBooking } from "./type-booking";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({ params }: { params: { slug: string } }) {
  const db = getDb();
  const settings = await getBookingSettingsBySlug(db, params.slug);
  if (!settings || !settings.active) notFound();

  const [lc] = await db
    .select({ name: schema.localCommittees.name })
    .from(schema.localCommittees)
    .where(eq(schema.localCommittees.id, settings.lcId))
    .limit(1);
  const orgName = lc?.name ?? "AIESEC";

  const types = await getActiveAppointmentTypes(db, settings.lcId);

  return (
    <main className="book-page">
      <div className="book-card">
        {types.length === 1 ? (
          // A single type — skip the menu and show the picker directly.
          <TypeBooking settings={settings} type={types[0]} orgName={orgName} />
        ) : (
          <>
            <header className="book-header">
              <span className="book-org">{orgName}</span>
              <h1>{settings.title}</h1>
              {settings.description && <p className="book-desc">{settings.description}</p>}
            </header>
            <section className="book-body">
              {types.length === 0 ? (
                <p className="book-empty">No meeting types are available to book right now. Please check back soon.</p>
              ) : (
                <ul className="book-menu">
                  {types.map((t) => (
                    <li key={t.id}>
                      <Link href={`/book/${settings.slug}/${t.slug}`} className="book-type-card">
                        <span className="book-type-accent" style={{ background: t.color }} aria-hidden />
                        <span className="book-type-main">
                          <strong>{t.name}</strong>
                          {t.description && <span className="book-type-desc">{t.description}</span>}
                          <span className="book-type-meta">
                            <Clock size={13} /> {t.durationMinutes} min
                          </span>
                        </span>
                        <ArrowRight size={16} className="book-type-arrow" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <p className="book-footer">Powered by AIESEC CRM</p>
    </main>
  );
}
