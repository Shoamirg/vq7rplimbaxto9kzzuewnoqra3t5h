import { ReportsWorkspace } from "@/components/reports/reports-workspace";

export const dynamic = "force-dynamic";

// Reports — a decision center projecting over the ledger + event stream.
export default function ReportsPage() {
  return (
    <div className="h-full">
      <ReportsWorkspace />
    </div>
  );
}
