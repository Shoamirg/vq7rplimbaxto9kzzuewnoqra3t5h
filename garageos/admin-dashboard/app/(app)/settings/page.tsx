import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/api/server";
import { canManageTeam } from "@/lib/auth/permissions";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const dynamic = "force-dynamic";

// Settings administers the tenant (team, roles, branding), so it is admin-only.
// The sidebar already hides the link for non-admins; this guards direct
// navigation, and the API enforces the same rules on every write.
export default async function SettingsPage() {
  const user = await getCurrentUser();
  const allowed = canManageTeam({
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: user.role,
    isSuperAdmin: user.is_super_admin,
  });
  if (!allowed) redirect("/dashboard");
  return <SettingsScreen />;
}
