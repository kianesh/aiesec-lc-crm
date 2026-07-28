import { Suspense } from "react";
import { requireMembership } from "../../../lib/auth";
import { getDashboardData } from "../../../lib/dashboard-data";
import { getDashboardAgenda } from "../../../lib/dashboard-agenda";
import { DashboardClient } from "../../../components/dashboard-client";
import { DashboardAgenda } from "../../../components/dashboard-agenda";
import { DashboardInstagram } from "../../../components/dashboard-instagram";
import { DashboardForms } from "../../../components/dashboard-forms";

export const dynamic = "force-dynamic";

function WidgetSkeleton() {
  return <section className="card" style={{ padding: 20, minHeight: 120 }}><p className="muted-note">Loading…</p></section>;
}

async function AgendaSection({ lcId, eventStatus }: { lcId: string; eventStatus?: string }) {
  const agenda = await getDashboardAgenda(lcId);
  return <DashboardAgenda agenda={agenda} eventStatus={eventStatus} />;
}

export default async function DashboardPage({ searchParams }: { searchParams: { event?: string } }) {
  const { activeMembership } = await requireMembership();
  const data = await getDashboardData(activeMembership.lcId);
  const lcId = activeMembership.lcId;

  return (
    <>
      {/* Calendar / agenda — full width at the very top of the dashboard. */}
      <div className="content dash-agenda-top">
        <Suspense fallback={<WidgetSkeleton />}>
          <AgendaSection lcId={lcId} eventStatus={searchParams.event} />
        </Suspense>
      </div>

      <DashboardClient data={data} lcName={activeMembership.lcName} />

      <div className="content dash-extra">
        <div className="dash-extra-grid">
          <Suspense fallback={<WidgetSkeleton />}>
            <DashboardInstagram lcId={lcId} />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton />}>
            <DashboardForms lcId={lcId} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
