import { EmptyRoute } from "../../../components/empty-route";

export default function ContactsPage() {
  return (
    <EmptyRoute
      eyebrow="Phase 3"
      title="Contacts"
      text="Contacts will come from manual creation, CSV import, and EXPA sync instead of mock data."
      items={["Server-side table", "Tags", "Custom fields", "Activity timeline"]}
    />
  );
}
