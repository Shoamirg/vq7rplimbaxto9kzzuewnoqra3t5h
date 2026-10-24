import { TeamManager } from "@/components/settings/team-manager";
import { StaffAccounts } from "@/components/settings/staff-accounts";
import { getCurrentUser } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const allowed = user.role === 'admin' && !!user.permissions?.includes('staff.write');
  return <><StaffAccounts allowed={allowed} />{allowed && <div className="mx-auto max-w-3xl p-4 sm:p-6"><TeamManager /></div>}</>;
}
