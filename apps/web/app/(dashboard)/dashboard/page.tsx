import { requireMembership } from "../../../lib/auth";
import { getDashboardData } from "../../../lib/dashboard-data";
import { DashboardClient } from "../../../components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { activeMembership } = await requireMembership();
  const data = await getDashboardData(activeMembership.lcId);

  return <DashboardClient data={data} lcName={activeMembership.lcName} />;
}
