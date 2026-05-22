import { EmptyRoute } from "../../../components/empty-route";

export default function ConversationsPage() {
  return (
    <EmptyRoute
      eyebrow="Phase 5"
      title="Conversations"
      text="Unified inbox route is protected and scoped to the active LC. Mailgun/Meta webhooks will write threads here."
      items={["Email threads", "Instagram DMs", "Assignment", "Realtime updates"]}
    />
  );
}
