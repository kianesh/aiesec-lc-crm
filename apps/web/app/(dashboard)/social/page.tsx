import { EmptyRoute } from "../../../components/empty-route";

export default function SocialPage() {
  return (
    <EmptyRoute
      eyebrow="Phase 7"
      title="Social Planner"
      text="Scheduled posts will be persisted and dispatched through Inngest jobs."
      items={["Calendar", "Post composer", "Queue", "Analytics"]}
    />
  );
}
