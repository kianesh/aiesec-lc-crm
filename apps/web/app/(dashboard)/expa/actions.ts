"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { syncExpaSnapshot } from "../../../lib/expa/sync";

const syncSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional()
});

export async function syncExpaAnalytics(formData: FormData) {
  const { user, activeMembership } = await requireMembership();
  if (activeMembership.role === "member") redirect("/expa?error=not_allowed");

  const input = syncSchema.parse({
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined
  });

  // The EXPA calls, snapshot write and audit entry live in lib/expa/sync so the
  // mobile endpoint produces byte-identical snapshots.
  const result = await syncExpaSnapshot(getDb(), activeMembership.lcId, {
    startDate: input.startDate,
    endDate: input.endDate,
    actorId: user.id
  });

  if (!result.ok) redirect(`/expa?error=${result.error}`);
  redirect(result.partial ? "/expa?synced=partial" : "/expa?synced=success");
}
