import { EmptyRoute } from "../../../components/empty-route";

export default function EmailPage() {
  return (
    <EmptyRoute
      eyebrow="Phase 4"
      title="Email Campaigns"
      text="Mailgun sending and webhook tracking will populate campaigns, messages, and stats."
      items={["Single send", "Campaigns", "Templates", "Delivery stats"]}
    />
  );
}
