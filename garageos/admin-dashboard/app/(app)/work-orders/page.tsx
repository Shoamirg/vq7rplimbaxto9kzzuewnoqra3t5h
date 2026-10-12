import { getCurrentUser } from "@/lib/api/server";
import { WorkOrdersWorkspace } from "@/components/work-orders/work-orders-workspace";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const orderId = typeof params.order === "string" ? params.order : null;
  return <WorkOrdersWorkspace role={user.role ?? ""} initialOrderId={orderId} />;
}
