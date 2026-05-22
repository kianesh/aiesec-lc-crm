import { EmptyRoute } from "../../../components/empty-route";

export default function ExpaPage() {
  return (
    <EmptyRoute
      eyebrow="Phase 2"
      title="EXPA Analytics"
      text="The EXPA API wrapper is in place. Connect credentials, then sync people, opportunities, applications, and committee metrics."
      items={["OAuth connection", "People endpoint", "Opportunities endpoint", "Applications endpoint", "Committee statistics wrapper"]}
    />
  );
}
