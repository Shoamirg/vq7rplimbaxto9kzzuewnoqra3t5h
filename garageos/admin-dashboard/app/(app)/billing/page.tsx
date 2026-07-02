import { BillingWorkspace } from "@/components/billing/billing-workspace";

export const dynamic = "force-dynamic";

// Commercial Operations — estimates, invoices, payments on the live billing API.
export default function BillingPage() {
  return (
    <div className="h-full">
      <BillingWorkspace />
    </div>
  );
}
