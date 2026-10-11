import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

// Commercial Operations — estimates, invoices, payments on the live billing API.
export default function BillingPage() {
  return (
    <div className="h-full">
      <Suspense><BillingWorkspace /></Suspense>
    </div>
  );
}
