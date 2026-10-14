import { StaffAccounts } from "@/components/settings/staff-accounts";
import { getCurrentUser } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return <StaffAccounts allowed={user.role === 'admin' && !!user.permissions?.includes('staff.write')} />;
}
