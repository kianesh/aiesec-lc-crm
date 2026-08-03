import type {
  Capability as ContractCapability,
  ContactSource,
  ContactType,
  ConversationChannel,
  ConversationStatus,
  FunnelStage,
  IntegrationStatus,
  LcRole,
  MessageDirection,
  Portfolio,
  Position as ContractPosition,
  Programme
} from "@aiesec/api-contract";
import type { schema } from "@aiesec/db";
import type { Capability, Position } from "../permissions";

// The contract package re-declares the schema's enums so the mobile bundle
// never imports drizzle. These assertions are the guard rail: if a value is
// added to (or removed from) the Drizzle enum without updating
// packages/api-contract/src/enums.ts, `npm run typecheck` fails here rather
// than at runtime on someone's phone.

type SchemaEnum<T extends { enumValues: readonly string[] }> = T["enumValues"][number];

type _ContactType = ContactType extends SchemaEnum<typeof schema.contactTypeEnum>
  ? SchemaEnum<typeof schema.contactTypeEnum> extends ContactType
    ? true
    : never
  : never;

type _FunnelStage = FunnelStage extends SchemaEnum<typeof schema.funnelStageEnum>
  ? SchemaEnum<typeof schema.funnelStageEnum> extends FunnelStage
    ? true
    : never
  : never;

type _Programme = Programme extends SchemaEnum<typeof schema.programmeEnum>
  ? SchemaEnum<typeof schema.programmeEnum> extends Programme
    ? true
    : never
  : never;

type _ContactSource = ContactSource extends SchemaEnum<typeof schema.contactSourceEnum>
  ? SchemaEnum<typeof schema.contactSourceEnum> extends ContactSource
    ? true
    : never
  : never;

type _Channel = ConversationChannel extends SchemaEnum<typeof schema.conversationChannelEnum>
  ? SchemaEnum<typeof schema.conversationChannelEnum> extends ConversationChannel
    ? true
    : never
  : never;

type _ConvStatus = ConversationStatus extends SchemaEnum<typeof schema.conversationStatusEnum>
  ? SchemaEnum<typeof schema.conversationStatusEnum> extends ConversationStatus
    ? true
    : never
  : never;

type _Direction = MessageDirection extends SchemaEnum<typeof schema.messageDirectionEnum>
  ? SchemaEnum<typeof schema.messageDirectionEnum> extends MessageDirection
    ? true
    : never
  : never;

type _Role = LcRole extends SchemaEnum<typeof schema.lcRoleEnum>
  ? SchemaEnum<typeof schema.lcRoleEnum> extends LcRole
    ? true
    : never
  : never;

type _Portfolio = Portfolio extends SchemaEnum<typeof schema.lcPortfolioEnum>
  ? SchemaEnum<typeof schema.lcPortfolioEnum> extends Portfolio
    ? true
    : never
  : never;

type _IntegrationStatus = IntegrationStatus extends SchemaEnum<typeof schema.integrationStatusEnum>
  ? SchemaEnum<typeof schema.integrationStatusEnum> extends IntegrationStatus
    ? true
    : never
  : never;

// The app-layer permission model (lib/permissions.ts) must match too.
type _Position = ContractPosition extends Position ? (Position extends ContractPosition ? true : never) : never;
type _Capability = ContractCapability extends Capability
  ? Capability extends ContractCapability
    ? true
    : never
  : never;

export type EnumParityChecks = [
  _ContactType,
  _FunnelStage,
  _Programme,
  _ContactSource,
  _Channel,
  _ConvStatus,
  _Direction,
  _Role,
  _Portfolio,
  _IntegrationStatus,
  _Position,
  _Capability
];
