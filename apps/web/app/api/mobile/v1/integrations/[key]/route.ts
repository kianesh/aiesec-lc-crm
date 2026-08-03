import {
  INTEGRATION_KEYS,
  integrationActionSchema,
  type IntegrationActionResponse,
  type IntegrationKey
} from "@aiesec/api-contract";
import { authed } from "../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk, zodError } from "../../../../../../lib/api/respond";
import { deleteIntegration } from "../../../../../../lib/connectors/store";
import { syncInstagramConversationsToDb } from "../../../../../../lib/connectors/instagram";
import { importContactsFromNotion, pushContactsToNotion } from "../../../../../../lib/connectors/notion";
import { getDb } from "../../../../../../lib/db";
import { syncExpaSnapshot } from "../../../../../../lib/expa/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Notion and Instagram sync page through their APIs, and an EXPA snapshot is
// two slow round trips — none of them fit the default 10s serverless budget.
export const maxDuration = 60;

export const OPTIONS = corsPreflight;

type Params = { params: { key: string } };

/** Catalog key -> the `integrationProviderEnum` value it is stored under. */
const PROVIDER_FOR: Record<Exclude<IntegrationKey, "resend">, "expa" | "google_drive" | "notion" | "meta"> = {
  expa: "expa",
  google: "google_drive",
  notion: "notion",
  instagram: "meta"
};

function isKey(value: string): value is IntegrationKey {
  return (INTEGRATION_KEYS as readonly string[]).includes(value);
}

/**
 * The connector helpers signal failure by throwing with a message worth showing
 * ("Notion is not connected.", "Instagram token expired"). Letting those reach
 * `withApiErrors` would flatten them into a generic 500, so catch them here and
 * pass the text through as a 4xx the app can display.
 */
async function run<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "That sync failed. Try again." };
  }
}

/**
 * Runs one of the connector actions the phone is allowed to trigger.
 *
 * Connecting is not among them: Google, Notion and Instagram are OAuth redirect
 * flows and EXPA needs a pasted token, so the app links to the web app for
 * those. Everything here is server-side work with no browser round trip.
 */
export const POST = authed<Params>(
  async (request, session, { params }) => {
    if (!isKey(params.key)) return jsonError("not_found", "Unknown integration.");
    const key = params.key;

    const payload = await request.json().catch(() => null);
    const parsed = integrationActionSchema.safeParse(payload ?? {});
    if (!parsed.success) return zodError(parsed.error);
    const { action } = parsed.data;

    const db = getDb();
    const lcId = session.membership.lcId;

    if (action === "disconnect") {
      if (key === "resend") {
        return jsonError("invalid_request", "Resend is configured on the server and can't be disconnected here.");
      }
      await deleteIntegration(db, lcId, PROVIDER_FOR[key]);
      return jsonOk<IntegrationActionResponse>({ ok: true, message: "Disconnected." });
    }

    // Each remaining action belongs to exactly one connector; reject mismatches
    // rather than silently running the wrong sync.
    if (action === "expa_sync") {
      if (key !== "expa") return jsonError("invalid_request", "That action doesn't apply to this integration.");
      const result = await syncExpaSnapshot(db, lcId, { actorId: session.userId });
      if (!result.ok) {
        return jsonError(
          "invalid_request",
          result.error === "missing_expa_connection"
            ? "EXPA isn't connected. Connect it from Integrations on the web app."
            : "Add an EXPA committee ID in Integrations before syncing."
        );
      }
      return jsonOk<IntegrationActionResponse>({
        ok: true,
        message: result.partial ? "Synced with some errors — check EXPA analytics." : "EXPA analytics synced."
      });
    }

    if (action === "notion_push") {
      if (key !== "notion") return jsonError("invalid_request", "That action doesn't apply to this integration.");
      const result = await run(() => pushContactsToNotion(db, lcId));
      if (!result.ok) return jsonError("invalid_request", result.message);
      return jsonOk<IntegrationActionResponse>({
        ok: true,
        message: `Pushed ${result.value.pushed} contact${result.value.pushed === 1 ? "" : "s"} to Notion.`
      });
    }

    if (action === "notion_pull") {
      if (key !== "notion") return jsonError("invalid_request", "That action doesn't apply to this integration.");
      const result = await run(() => importContactsFromNotion(db, lcId));
      if (!result.ok) return jsonError("invalid_request", result.message);
      return jsonOk<IntegrationActionResponse>({
        ok: true,
        message: `Imported ${result.value.imported} contact${result.value.imported === 1 ? "" : "s"} from Notion.`
      });
    }

    if (key !== "instagram") return jsonError("invalid_request", "That action doesn't apply to this integration.");
    const result = await run(() => syncInstagramConversationsToDb(db, lcId));
    if (!result.ok) return jsonError("invalid_request", result.message);

    const { synced, fetched, skippedNoParticipant } = result.value;
    // Say why nothing landed rather than reporting a bare zero: threads that
    // arrive without participant details mean the token lacks
    // instagram_business_manage_messages.
    if (synced === 0 && skippedNoParticipant > 0) {
      return jsonError(
        "invalid_request",
        `Instagram returned ${fetched} conversation(s) but none included participant details. Reconnect Instagram so the token includes instagram_business_manage_messages.`
      );
    }

    return jsonOk<IntegrationActionResponse>({
      ok: true,
      message:
        synced === 0
          ? "Instagram had no conversations to import."
          : `Synced ${synced} Instagram conversation${synced === 1 ? "" : "s"}.`
    });
  },
  { capability: "manage_integrations" }
);
