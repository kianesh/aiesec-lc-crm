import { availabilitySchema, type AvailabilityRuleDto } from "@aiesec/api-contract";
import { schema } from "@aiesec/db";
import { eq } from "drizzle-orm";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { getAvailabilityRules } from "../../../../../../lib/booking/store";
import { getDb } from "../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = corsPreflight;

// Replaces the whole weekly grid in one call, mirroring the web editor: the
// rules table has no natural client-side id to diff against, so the app sends
// the set it wants and this swaps it in. PATCH rather than PUT because that is
// the write verb the shared CORS allow-list and mobile client already permit.
export const PATCH = authed(
  async (request, session) => {
    const payload = await request.json().catch(() => null);
    const parsed = availabilitySchema.safeParse(payload ?? {});
    if (!parsed.success) return zodError(parsed.error);

    const db = getDb();
    const lcId = session.membership.lcId;
    const { rules } = parsed.data;

    await db.transaction(async (tx) => {
      await tx.delete(schema.availabilityRules).where(eq(schema.availabilityRules.lcId, lcId));
      if (rules.length > 0) {
        await tx.insert(schema.availabilityRules).values(
          rules.map((rule) => ({
            lcId,
            weekday: rule.weekday,
            startTime: rule.startTime,
            endTime: rule.endTime
          }))
        );
      }
    });

    const saved = await getAvailabilityRules(db, lcId);
    return jsonOk<{ rules: AvailabilityRuleDto[] }>({
      rules: saved.map((rule) => ({
        weekday: rule.weekday,
        startTime: rule.startTime,
        endTime: rule.endTime
      }))
    });
  },
  { capability: "manage_booking" }
);
