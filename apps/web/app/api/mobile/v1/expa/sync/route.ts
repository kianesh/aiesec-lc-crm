import { expaSyncSchema, type ExpaSyncResponse } from "@aiesec/api-contract";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { syncExpaSnapshot } from "../../../../../../lib/expa/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// EXPA's analytics endpoints are slow; the default 10s serverless budget isn't
// enough for the two round trips a snapshot needs.
export const maxDuration = 60;

export const OPTIONS = corsPreflight;

export const POST = authed(
  async (request, session) => {
    // Body is optional: "sync now" from the phone uses the default window.
    const payload = await request.json().catch(() => ({}));
    const parsed = expaSyncSchema.safeParse(payload ?? {});
    if (!parsed.success) return zodError(parsed.error);

    const result = await syncExpaSnapshot(getDb(), session.membership.lcId, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      actorId: session.userId
    });

    if (!result.ok) {
      return jsonError(
        "invalid_request",
        result.error === "missing_expa_connection"
          ? "EXPA isn't connected. Connect it from Integrations on the web app."
          : "Add an EXPA committee ID in Integrations before syncing."
      );
    }

    const body: ExpaSyncResponse = {
      ok: true,
      partial: result.partial,
      errors: result.summary.errors
    };

    return jsonOk(body);
  },
  { capability: "manage_integrations" }
);
