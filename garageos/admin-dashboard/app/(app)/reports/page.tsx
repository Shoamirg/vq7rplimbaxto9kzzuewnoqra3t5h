import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/api/server";

export const dynamic = "force-dynamic";

// Reports — a decision center projecting over the ledger + event stream.
export default async function ReportsPage() {
  const user = await getCurrentUser();
  const canViewReports = user.role === "admin" || user.role === "manager" || user.permissions?.includes("financial.reports.read");
  if (!canViewReports) redirect("/dashboard");
  return (
    <div className="h-full">
      <ReportsWorkspace />
    </div>
  );
}
