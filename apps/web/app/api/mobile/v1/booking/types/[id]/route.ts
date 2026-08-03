import { appointmentTypeToggleSchema } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { and, eq } from "drizzle-orm";
import { authed } from "../../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

// Enable/disable a bookable type. Renaming one, retiming it or editing its
// intake questions stays on the web app — this is the one toggle that is
// genuinely useful to hit from a phone ("stop taking bookings for now").
export const PATCH = authed<Params>(
  async (request, session, { params }) => {
    const payload = await request.json().catch(() => null);
    const parsed = appointmentTypeToggleSchema.safeParse(payload ?? {});
    if (!parsed.success) return zodError(parsed.error);

    const db = getDb();
    const updated = await db
      .update(schema.appointmentTypes)
      .set({ active: parsed.data.active, updatedAt: new Date() })
      .where(
        and(
          eq(schema.appointmentTypes.id, params.id),
          // Scope to the caller's LC so an id from another workspace can't be
          // toggled by guessing it.
          eq(schema.appointmentTypes.lcId, session.membership.lcId)
        )
      )
      .returning({ id: schema.appointmentTypes.id, active: schema.appointmentTypes.active });

    const row = updated[0];
    if (!row) return jsonError("not_found", "That appointment type no longer exists.");

    return jsonOk<{ id: string; active: boolean }>(row);
  },
  { capability: "manage_booking" }
);
