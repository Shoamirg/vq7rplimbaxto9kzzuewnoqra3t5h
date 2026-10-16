import { notFound } from "next/navigation";

import { ApiError, getCustomer360, getCurrentUser } from "@/lib/api/server";
import { CustomerScreen } from "@/components/customers/customer-screen";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [customer, user] = await Promise.all([getCustomer360(id), getCurrentUser()]);
    return <CustomerScreen customer={customer} canManageAccount={user.role === "admin" && !!user.permissions?.includes("staff.write")} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
