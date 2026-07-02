import { notFound } from "next/navigation";

import { ApiError, getCustomer360 } from "@/lib/api/server";
import { CustomerScreen } from "@/components/customers/customer-screen";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const customer = await getCustomer360(id);
    return <CustomerScreen customer={customer} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
