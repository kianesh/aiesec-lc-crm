import { computeAvailableSlots } from "../../../lib/booking/availability";
import { getAvailabilityRules, mergeSlotConfig } from "../../../lib/booking/store";
import type { AppointmentType, BookingSettings } from "../../../lib/booking/store";
import { normalizeIntakeFields } from "../../../lib/booking/intake";
import { getDb } from "../../../lib/db";
import { BookingClient, MeetingMeta } from "./booking-client";

/**
 * Renders the org header + slot picker for a single appointment type. Shared by
 * the LC hub (when there's only one type) and the /book/<lc>/<type> page.
 */
export async function TypeBooking({
  settings,
  type,
  orgName
}: {
  settings: BookingSettings;
  type: AppointmentType;
  orgName: string;
}) {
  const db = getDb();
  const rules = await getAvailabilityRules(db, settings.lcId);
  const config = mergeSlotConfig(settings, type);
  const days = await computeAvailableSlots(db, config, rules, Date.now());

  return (
    <>
      <header className="book-header">
        <span className="book-org">{orgName}</span>
        <h1>{type.name}</h1>
        {type.description && <p className="book-desc">{type.description}</p>}
        <MeetingMeta durationMinutes={type.durationMinutes} />
      </header>
      <section className="book-body">
        <BookingClient
          slug={settings.slug}
          typeSlug={type.slug}
          days={days}
          durationMinutes={type.durationMinutes}
          timezone={settings.timezone}
          intakeFields={normalizeIntakeFields(type.intakeFields)}
        />
      </section>
    </>
  );
}
