import { z } from "zod";
import {
  CONTACT_TYPES,
  FUNNEL_STAGES,
  PROGRAMMES,
  type ContactSource,
  type ContactType,
  type FunnelStage,
  type Programme
} from "./enums";

// ------------------------------------------------------------------ DTOs --

export type ContactListItemDto = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  type: ContactType;
  funnelStage: FunnelStage | null;
  programme: Programme | null;
  source: ContactSource;
  tags: string[];
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
};

export type ContactActivityDto = {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  authorName: string | null;
  /** ISO 8601 */
  createdAt: string;
};

export type ContactDetailDto = ContactListItemDto & {
  nationality: string | null;
  homeCommitteeId: string | null;
  expaPersonId: string | null;
  customFields: Record<string, unknown>;
  activities: ContactActivityDto[];
  conversations: { id: string; channel: string; status: string; lastMessageAt: string | null }[];
};

export type ContactListResponse = {
  contacts: ContactListItemDto[];
  total: number;
  limit: number;
  offset: number;
  /** Every tag in use across the LC, for the filter sheet. */
  availableTags: string[];
};

// -------------------------------------------------------------- requests --

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const contactListQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  type: z.preprocess(emptyToUndefined, z.enum(CONTACT_TYPES).optional()),
  stage: z.preprocess(emptyToUndefined, z.enum(FUNNEL_STAGES).optional()),
  programme: z.preprocess(emptyToUndefined, z.enum(PROGRAMMES).optional()),
  tag: z.preprocess(emptyToUndefined, z.string().max(80).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

const nullableTrimmed = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().max(max).nullable().optional()
  );

export const createContactSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().email("Enter a valid email").nullable().optional()
  ),
  phone: nullableTrimmed(60),
  type: z.enum(CONTACT_TYPES).default("candidate"),
  funnelStage: z.enum(FUNNEL_STAGES).nullable().optional(),
  programme: z.enum(PROGRAMMES).nullable().optional(),
  nationality: nullableTrimmed(120),
  homeCommitteeId: nullableTrimmed(120),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional()
});

export type CreateContactInput = z.input<typeof createContactSchema>;

// Partial update — every field optional, but at least one must be present so a
// no-op PATCH is a client bug rather than a silent success.
export const updateContactSchema = createContactSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export type UpdateContactInput = z.input<typeof updateContactSchema>;
