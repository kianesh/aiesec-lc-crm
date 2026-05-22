import { AppShell } from "../../components/app-shell";
import { requireMembership } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { memberships, activeMembership } = await requireMembership();
  return (
    <AppShell memberships={memberships} activeMembership={activeMembership}>
      {children}
    </AppShell>
  );
}
