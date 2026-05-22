import { EmptyRoute } from "../../../components/empty-route";

export default function IntegrationsPage() {
  return (
    <EmptyRoute
      eyebrow="Connections"
      title="Integrations"
      text="Integration records are LC-scoped and ready for encrypted credentials."
      items={["EXPA", "Mailgun", "Meta", "Notion", "Google Drive"]}
    />
  );
}
