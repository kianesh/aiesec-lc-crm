import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { CalendarCheck, CalendarX, Video } from "lucide-react";
import { notFound } from "next/navigation";
import { getDb } from "../../../../lib/db";
import { CancelButton } from "./manage-client";

export const dynamic = "force-dynamic";

export default async function ManageBookingPage({
  params,
  searchParams
}: {
  params: { token: string };
  searchParams: { booked?: string };
}) {
  const db = getDb();
  const [appt] = await db
    .select()
    .from(schema.appointments)
    .where(eq(schema.appointments.cancelToken, params.token))
    .limit(1);

  if (!appt) notFound();

  const [lc] = await db
    .select({ name: schema.localCommittees.name })
    .from(schema.localCommittees)
    .where(eq(schema.localCommittees.id, appt.lcId))
    .limit(1);

  const start = DateTime.fromJSDate(appt.startAt).setZone(appt.timezone);
  const cancelled = appt.status === "cancelled";
  const justBooked = searchParams.booked === "1" && !cancelled;

  return (
    <main className="book-page">
      <div className="book-card">
        <header className="book-header">
          <span className="book-org">{lc?.name ?? "AIESEC"}</span>
          {cancelled ? (
            <h1 className="book-status-cancelled">
              <CalendarX size={20} /> Booking cancelled
            </h1>
          ) : (
            <h1 className="book-status-confirmed">
              <CalendarCheck size={20} /> {justBooked ? "You're booked!" : "Your booking"}
            </h1>
          )}
        </header>
        <section className="book-body">
          <dl className="book-summary-list">
            <div>
              <dt>When</dt>
              <dd>
                {start.toFormat("cccc, LLLL d, yyyy")}
                <br />
                {start.toFormat("h:mm a")} ({appt.timezone})
              </dd>
            </div>
            <div>
              <dt>Guest</dt>
              <dd>
                {appt.guestName}
                <br />
                {appt.guestEmail}
              </dd>
            </div>
            {!cancelled && appt.meetUrl && (
              <div>
                <dt>Join</dt>
                <dd>
                  <a className="book-meet-link" href={appt.meetUrl} target="_blank" rel="noreferrer">
                    <Video size={15} /> Google Meet
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {!cancelled && !appt.meetUrl && (
            <p className="book-note">A meeting link will be emailed to you shortly.</p>
          )}
          {!cancelled && (
            <p className="book-note">A calendar invite has been sent to {appt.guestEmail}.</p>
          )}

          {!cancelled && <CancelButton token={params.token} />}
          {cancelled && <p className="book-note">This appointment has been cancelled.</p>}
        </section>
      </div>
      <p className="book-footer">Powered by AIESEC CRM</p>
    </main>
  );
}
