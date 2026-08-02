import { z } from "zod";
import {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUSES,
  type ConversationChannel,
  type ConversationStatus,
  type MessageDirection
} from "./enums";

// ------------------------------------------------------------------ DTOs --

export type ConversationListItemDto = {
  id: string;
  name: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  unreadCount: number;
  /** ISO 8601 */
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  contactId: string | null;
  assignedTo: { id: string; name: string } | null;
};

export type MessageDto = {
  id: string;
  direction: MessageDirection;
  body: string;
  attachments: unknown[];
  /** ISO 8601 */
  sentAt: string;
};

export type ConversationDetailDto = {
  id: string;
  name: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  contact: { id: string; fullName: string; email: string | null; phone: string | null } | null;
  assignedTo: { id: string; name: string } | null;
  /** Whether this LC can actually deliver a reply on this channel right now. */
  canReply: boolean;
  replyBlockedReason: string | null;
  messages: MessageDto[];
};

export type ConversationListResponse = {
  conversations: ConversationListItemDto[];
  total: number;
  unreadTotal: number;
  /** Teammates a conversation can be assigned to. */
  assignees: { id: string; name: string }[];
};

// -------------------------------------------------------------- requests --

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const conversationListQuerySchema = z.object({
  channel: z.preprocess(emptyToUndefined, z.enum(CONVERSATION_CHANNELS).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(CONVERSATION_STATUSES).optional()),
  /** "me" restricts to conversations assigned to the caller. */
  assigned: z.preprocess(emptyToUndefined, z.literal("me").optional()),
  unread: z.preprocess(emptyToUndefined, z.coerce.boolean().optional()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const updateConversationSchema = z
  .object({
    status: z.enum(CONVERSATION_STATUSES).optional(),
    /** null unassigns. */
    assignedTo: z.string().uuid().nullable().optional()
  })
  .refine((value) => value.status !== undefined || value.assignedTo !== undefined, {
    message: "Nothing to update"
  });

export type UpdateConversationInput = z.input<typeof updateConversationSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty").max(4000)
});

export type SendMessageInput = z.input<typeof sendMessageSchema>;

export type SendMessageResponse = {
  message: MessageDto;
  /** False when the message was recorded locally but not delivered upstream. */
  delivered: boolean;
  deliveryError: string | null;
};
