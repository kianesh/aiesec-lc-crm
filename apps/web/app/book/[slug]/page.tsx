import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "../../../lib/db";
import { computeAvailableSlots } from "../../../lib/booking/availability";
import { getAvailabilityRules, getBookingSettingsBySlug } from "../../../lib/booking/store";
import { BookingClient, MeetingMeta } from "./booking-client";

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

  const rules = await getAvailabilityRules(db, settings.lcId);
  const days = await computeAvailableSlots(db, settings, rules, Date.now());

  return (
    <main className="book-page">
      <div className="book-card">
        <header className="book-header">
          <span className="book-org">{lc?.name ?? "AIESEC"}</span>
          <h1>{settings.title}</h1>
          {settings.description && <p className="book-desc">{settings.description}</p>}
          <MeetingMeta durationMinutes={settings.durationMinutes} />
        </header>
        <section className="book-body">
          <BookingClient
            slug={settings.slug}
            days={days}
            durationMinutes={settings.durationMinutes}
            timezone={settings.timezone}
          />
        </section>
      </div>
      <p className="book-footer">Powered by AIESEC CRM</p>
    </main>
  );
}
