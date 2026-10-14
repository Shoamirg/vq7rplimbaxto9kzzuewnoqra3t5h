import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/api/server";

export const dynamic = "force-dynamic";

// Commercial Operations — estimates, invoices, payments on the live billing API.
export default async function BillingPage() {
  const user = await getCurrentUser();
  return (
    <div className="h-full">
      <Suspense><BillingWorkspace canVoid={Boolean(user.permissions?.includes("financial.invoice.void"))} /></Suspense>
    </div>
  );
}
