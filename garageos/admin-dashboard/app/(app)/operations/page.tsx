import { OperationsConsole } from "@/components/operations/operations-console";
import { getCurrentUser } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const user = await getCurrentUser();
  return (
    <div className="h-full">
      <OperationsConsole canWrite={user.permissions?.includes("staff.write") ?? false} />
    </div>
  );
}
