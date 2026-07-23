import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../../lib/db";
import {
  getActiveAppointmentTypes,
  getAppointmentTypeBySlug,
  getBookingSettingsBySlug
} from "../../../../lib/booking/store";
import { TypeBooking } from "../type-booking";

export const dynamic = "force-dynamic";

export default async function PublicTypeBookingPage({
  params
}: {
  params: { slug: string; type: string };
}) {
  const db = getDb();
  const settings = await getBookingSettingsBySlug(db, params.slug);
  if (!settings || !settings.active) notFound();

  const type = await getAppointmentTypeBySlug(db, settings.lcId, params.type);
  if (!type || !type.active) notFound();

  const [lc] = await db
    .select({ name: schema.localCommittees.name })
    .from(schema.localCommittees)
    .where(eq(schema.localCommittees.id, settings.lcId))
    .limit(1);
  const orgName = lc?.name ?? "AIESEC";

  // Offer a "back" link only when there are other types to choose from.
  const types = await getActiveAppointmentTypes(db, settings.lcId);
  const showBack = types.length > 1;

  return (
    <main className="book-page">
      <div className="book-card">
        {showBack && (
          <Link href={`/book/${settings.slug}`} className="book-back book-back-top">
            <ArrowLeft size={14} /> All meeting types
          </Link>
        )}
        <TypeBooking settings={settings} type={type} orgName={orgName} />
      </div>
      <p className="book-footer">Powered by AIESEC CRM</p>
    </main>
  );
}
