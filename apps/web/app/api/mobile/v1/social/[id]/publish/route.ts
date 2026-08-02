import type { PublishPostResponse } from "@aiesec/api-contract";
import { authed } from "../../../../../../../lib/api/route";
import { corsPreflight, jsonError, jsonOk } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";
import { publishStoredPost } from "../../../../../../../lib/social/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Instagram's publish flow is two sequential Graph calls, and the second one
// waits on their media container being processed.
export const maxDuration = 60;

export const OPTIONS = corsPreflight;

type Params = { params: { id: string } };

export const POST = authed<Params>(
  async (_request, session, { params }) => {
    const result = await publishStoredPost(getDb(), session.membership.lcId, params.id);

    if (!result.ok) {
      const code =
        result.error === "not_found"
          ? "not_found"
          : result.error === "already_published"
            ? "conflict"
            : result.error === "publish_failed"
              ? "server_error"
              : "invalid_request";
      return jsonError(code, result.message);
    }

    const body: PublishPostResponse = { ok: true, mediaId: result.mediaId };
    return jsonOk(body);
  },
  { capability: "send_campaigns" }
);
