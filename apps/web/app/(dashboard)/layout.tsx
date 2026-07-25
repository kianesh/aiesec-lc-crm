import { AppShell } from "../../components/app-shell";
import { requireMembership } from "../../lib/auth";
import { getNotificationCount } from "../../lib/notifications";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeMembership } = await requireMembership();
  const notificationCount = await getNotificationCount(user.id).catch(() => 0);
  const shellUser = {
    name: (user.user_metadata?.full_name as string | undefined) || user.email || "You",
    email: user.email ?? "",
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null
  };
  return (
    <AppShell
      user={shellUser}
      memberships={memberships}
      activeMembership={activeMembership}
      notificationCount={notificationCount}
    >
      {children}
    </AppShell>
  );
}
