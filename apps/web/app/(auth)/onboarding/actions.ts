"use server";

import { schema } from "@aiesec/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "../../../lib/db";
import { ensureUserProfile } from "../../../lib/auth";

const createLcSchema = z.object({
  name: z.string().min(2),
  country: z.string().min(2),
  expaCommitteeId: z.string().optional()
});

export async function createLocalCommittee(formData: FormData) {
  const user = await ensureUserProfile();
  const input = createLcSchema.parse({
    name: formData.get("name"),
    country: formData.get("country"),
    expaCommitteeId: formData.get("expaCommitteeId") || undefined
  });
  const db = getDb();

  const [committee] = await db
    .insert(schema.localCommittees)
    .values({
      name: input.name,
      country: input.country,
      expaCommitteeId: input.expaCommitteeId,
      brandConfig: { primary: "#037ef3" }
    })
    .returning({ id: schema.localCommittees.id });

  await db.insert(schema.lcMembers).values({
    lcId: committee.id,
    userId: user.id,
    role: "owner"
  });

  await db.insert(schema.expaSyncState).values({ lcId: committee.id }).onConflictDoNothing();

  redirect("/dashboard");
}
