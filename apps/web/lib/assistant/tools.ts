import { schema } from "@aiesec/db";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import type { getDb } from "../db";

// Execution context — every tool is hard-scoped to the caller's LC so the
// agent can never read or mutate another committee's data.
export type ToolContext = {
  db: ReturnType<typeof getDb>;
  lcId: string;
  userId: string;
  role: "owner" | "admin" | "member";
};

// Anthropic tool schema (JSON Schema input). Kept in one place so the route
// and the executor stay in sync.
export const assistantTools = [
  {
    name: "search_contacts",
    description:
      "Search the LC's contacts by name/email and optionally filter by type or funnel stage. Use this to find people before acting on them.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Free-text match against name or email" },
        type: { type: "string", enum: ["candidate", "company", "lc_partner", "other"] },
        funnelStage: {
          type: "string",
          enum: ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"]
        },
        limit: { type: "number", description: "Max rows (default 20, max 50)" }
      }
    }
  },
  {
    name: "get_contact",
    description: "Fetch a single contact's full details plus their most recent activity history.",
    input_schema: {
      type: "object" as const,
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "get_contact_stats",
    description:
      "Get aggregate counts of contacts broken down by funnel stage and by type. Use for 'how many', pipeline, and reporting questions.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "create_contact",
    description: "Create a new contact in the LC. Returns the new contact id.",
    input_schema: {
      type: "object" as const,
      properties: {
        fullName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        type: { type: "string", enum: ["candidate", "company", "lc_partner", "other"] },
        funnelStage: {
          type: "string",
          enum: ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"]
        },
        programme: { type: "string", enum: ["gt", "ge", "gv", "other"] },
        nationality: { type: "string" }
      },
      required: ["fullName"]
    }
  },
  {
    name: "update_contact",
    description: "Update fields on an existing contact. Only provided fields are changed.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        fullName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        type: { type: "string", enum: ["candidate", "company", "lc_partner", "other"] },
        funnelStage: {
          type: "string",
          enum: ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"]
        },
        programme: { type: "string", enum: ["gt", "ge", "gv", "other"] },
        nationality: { type: "string" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "add_contact_note",
    description: "Attach a free-text note to a contact's activity timeline.",
    input_schema: {
      type: "object" as const,
      properties: { contactId: { type: "string" }, note: { type: "string" } },
      required: ["contactId", "note"]
    }
  },
  {
    name: "list_conversations",
    description: "List recent conversations (Instagram/email inbox threads), optionally filtered by status.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["open", "closed", "snoozed"] },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "draft_conversation_reply",
    description:
      "Append an outbound reply to a conversation thread (stored as a sent message). Use after the user approves the wording.",
    input_schema: {
      type: "object" as const,
      properties: { conversationId: { type: "string" }, body: { type: "string" } },
      required: ["conversationId", "body"]
    }
  },
  {
    name: "list_smart_lists",
    description: "List saved smart lists (contact segments) that can be used as email campaign audiences.",
    input_schema: { type: "object" as const, properties: {} }
  },
  {
    name: "create_email_campaign",
    description:
      "Create a DRAFT email campaign (newsletter). Never sends — the user reviews and sends from the Email tab. Returns the campaign id.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Internal campaign name" },
        subject: { type: "string" },
        bodyHtml: { type: "string", description: "HTML body of the email" },
        fromName: { type: "string" },
        fromEmail: { type: "string" },
        audienceSmartListId: { type: "string", description: "Optional smart list id to target" }
      },
      required: ["name", "subject", "bodyHtml"]
    }
  },
  {
    name: "create_social_post",
    description: "Create a DRAFT social media post in the content calendar. Returns the post id.",
    input_schema: {
      type: "object" as const,
      properties: {
        caption: { type: "string" },
        title: { type: "string" },
        platforms: {
          type: "array",
          items: { type: "string", enum: ["instagram", "facebook", "linkedin", "tiktok"] }
        },
        scheduledFor: { type: "string", description: "ISO 8601 datetime, optional" }
      },
      required: ["caption", "platforms"]
    }
  }
] as const;

type Json = Record<string, unknown>;

const limitOf = (raw: unknown, fallback = 20, max = 50) => {
  const n = typeof raw === "number" ? raw : fallback;
  return Math.min(Math.max(1, Math.floor(n)), max);
};

async function audit(ctx: ToolContext, action: string, entityType: string, entityId: string | null, metadata: Json) {
  await ctx.db.insert(schema.auditLog).values({
    lcId: ctx.lcId,
    userId: ctx.userId,
    action,
    entityType,
    entityId,
    metadata: { ...metadata, via: "assistant" }
  });
}

// Dispatch a single tool call. Returns a JSON-serializable result that is fed
// back to the model as the tool_result. Errors are returned (not thrown) so the
// model can recover gracefully.
export async function executeTool(name: string, input: Json, ctx: ToolContext): Promise<Json> {
  const { db, lcId } = ctx;
  try {
    switch (name) {
      case "search_contacts": {
        const conds = [eq(schema.contacts.lcId, lcId)];
        if (typeof input.query === "string" && input.query.trim()) {
          const q = `%${input.query.trim()}%`;
          conds.push(or(ilike(schema.contacts.fullName, q), ilike(schema.contacts.email, q))!);
        }
        if (typeof input.type === "string") conds.push(eq(schema.contacts.type, input.type as never));
        if (typeof input.funnelStage === "string")
          conds.push(eq(schema.contacts.funnelStage, input.funnelStage as never));

        const rows = await db
          .select({
            id: schema.contacts.id,
            fullName: schema.contacts.fullName,
            email: schema.contacts.email,
            type: schema.contacts.type,
            funnelStage: schema.contacts.funnelStage,
            programme: schema.contacts.programme
          })
          .from(schema.contacts)
          .where(and(...conds))
          .orderBy(desc(schema.contacts.updatedAt))
          .limit(limitOf(input.limit));
        return { count: rows.length, contacts: rows };
      }

      case "get_contact": {
        const [contact] = await db
          .select()
          .from(schema.contacts)
          .where(and(eq(schema.contacts.id, String(input.contactId)), eq(schema.contacts.lcId, lcId)))
          .limit(1);
        if (!contact) return { error: "Contact not found in this LC." };
        const activities = await db
          .select({ type: schema.contactActivities.type, metadata: schema.contactActivities.metadata, createdAt: schema.contactActivities.createdAt })
          .from(schema.contactActivities)
          .where(eq(schema.contactActivities.contactId, contact.id))
          .orderBy(desc(schema.contactActivities.createdAt))
          .limit(10);
        return { contact, activities };
      }

      case "get_contact_stats": {
        const byStage = await db
          .select({ funnelStage: schema.contacts.funnelStage, n: count() })
          .from(schema.contacts)
          .where(eq(schema.contacts.lcId, lcId))
          .groupBy(schema.contacts.funnelStage);
        const byType = await db
          .select({ type: schema.contacts.type, n: count() })
          .from(schema.contacts)
          .where(eq(schema.contacts.lcId, lcId))
          .groupBy(schema.contacts.type);
        const [{ total }] = await db
          .select({ total: count() })
          .from(schema.contacts)
          .where(eq(schema.contacts.lcId, lcId));
        return { total, byStage, byType };
      }

      case "create_contact": {
        if (!input.fullName) return { error: "fullName is required." };
        const [row] = await db
          .insert(schema.contacts)
          .values({
            lcId,
            fullName: String(input.fullName),
            email: (input.email as string) ?? null,
            phone: (input.phone as string) ?? null,
            type: (input.type as never) ?? "candidate",
            funnelStage: (input.funnelStage as never) ?? null,
            programme: (input.programme as never) ?? null,
            nationality: (input.nationality as string) ?? null,
            source: "manual"
          })
          .returning({ id: schema.contacts.id });
        await db.insert(schema.contactActivities).values({
          contactId: row.id,
          lcId,
          type: "created",
          createdBy: ctx.userId,
          metadata: { via: "assistant" }
        });
        await audit(ctx, "contact.created", "contact", row.id, { fullName: input.fullName });
        return { ok: true, contactId: row.id };
      }

      case "update_contact": {
        const id = String(input.contactId);
        const [existing] = await db
          .select({ id: schema.contacts.id })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.id, id), eq(schema.contacts.lcId, lcId)))
          .limit(1);
        if (!existing) return { error: "Contact not found in this LC." };
        const patch: Json = { updatedAt: new Date() };
        for (const f of ["fullName", "email", "phone", "type", "funnelStage", "programme", "nationality"]) {
          if (input[f] !== undefined) patch[f] = input[f];
        }
        await db.update(schema.contacts).set(patch as never).where(eq(schema.contacts.id, id));
        await db.insert(schema.contactActivities).values({
          contactId: id,
          lcId,
          type: input.funnelStage !== undefined ? "stage_changed" : "updated",
          createdBy: ctx.userId,
          metadata: { changed: Object.keys(patch).filter((k) => k !== "updatedAt"), to: input.funnelStage }
        });
        await audit(ctx, "contact.updated", "contact", id, { fields: Object.keys(patch) });
        return { ok: true, contactId: id };
      }

      case "add_contact_note": {
        const id = String(input.contactId);
        const [existing] = await db
          .select({ id: schema.contacts.id })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.id, id), eq(schema.contacts.lcId, lcId)))
          .limit(1);
        if (!existing) return { error: "Contact not found in this LC." };
        await db.insert(schema.contactActivities).values({
          contactId: id,
          lcId,
          type: "note_added",
          createdBy: ctx.userId,
          metadata: { note: String(input.note) }
        });
        return { ok: true };
      }

      case "list_conversations": {
        const conds = [eq(schema.conversations.lcId, lcId)];
        if (typeof input.status === "string") conds.push(eq(schema.conversations.status, input.status as never));
        const rows = await db
          .select({
            id: schema.conversations.id,
            channel: schema.conversations.channel,
            status: schema.conversations.status,
            participantName: schema.conversations.participantName,
            lastMessageAt: schema.conversations.lastMessageAt,
            unreadCount: schema.conversations.unreadCount
          })
          .from(schema.conversations)
          .where(and(...conds))
          .orderBy(desc(schema.conversations.lastMessageAt))
          .limit(limitOf(input.limit));
        return { count: rows.length, conversations: rows };
      }

      case "draft_conversation_reply": {
        const id = String(input.conversationId);
        const [conv] = await db
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(and(eq(schema.conversations.id, id), eq(schema.conversations.lcId, lcId)))
          .limit(1);
        if (!conv) return { error: "Conversation not found in this LC." };
        await db.insert(schema.messages).values({
          conversationId: id,
          direction: "out",
          body: String(input.body),
          sentAt: new Date()
        });
        await db
          .update(schema.conversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(schema.conversations.id, id));
        await audit(ctx, "conversation.replied", "conversation", id, {});
        return { ok: true };
      }

      case "list_smart_lists": {
        const rows = await db
          .select({ id: schema.smartLists.id, name: schema.smartLists.name, description: schema.smartLists.description })
          .from(schema.smartLists)
          .where(eq(schema.smartLists.lcId, lcId));
        return { count: rows.length, smartLists: rows };
      }

      case "create_email_campaign": {
        const [row] = await db
          .insert(schema.emailCampaigns)
          .values({
            lcId,
            name: String(input.name),
            subject: String(input.subject),
            bodyHtml: String(input.bodyHtml),
            fromName: (input.fromName as string) ?? "AIESEC",
            fromEmail: (input.fromEmail as string) ?? "",
            status: "draft",
            audienceSegmentId: (input.audienceSmartListId as string) ?? null,
            createdBy: ctx.userId
          })
          .returning({ id: schema.emailCampaigns.id });
        await audit(ctx, "email_campaign.created", "email_campaign", row.id, { name: input.name });
        return { ok: true, campaignId: row.id, note: "Created as draft. User must review and send from the Email tab." };
      }

      case "create_social_post": {
        const platforms = Array.isArray(input.platforms) ? (input.platforms as string[]) : [];
        if (platforms.length === 0) return { error: "At least one platform is required." };
        const [row] = await db
          .insert(schema.socialPosts)
          .values({
            lcId,
            title: (input.title as string) ?? null,
            platforms,
            content: { caption: String(input.caption) },
            scheduledFor: input.scheduledFor ? new Date(String(input.scheduledFor)) : null,
            status: input.scheduledFor ? "scheduled" : "draft",
            createdBy: ctx.userId
          })
          .returning({ id: schema.socialPosts.id });
        await audit(ctx, "social_post.created", "social_post", row.id, { platforms });
        return { ok: true, postId: row.id };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed." };
  }
}