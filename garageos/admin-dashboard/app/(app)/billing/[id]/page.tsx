import { redirect } from "next/navigation";

// Notifications link to /billing/<invoiceId>, but the billing workspace is a
// single page that opens a document via the ?doc= query param. Bridge the two.
export default async function BillingDeepLink({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/billing?doc=${encodeURIComponent(id)}`);
}
