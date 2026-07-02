import { getCustomers } from "@/lib/api/server";
import { CustomersList } from "@/components/customers/customers-list";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { items } = await getCustomers();
  return <CustomersList customers={items} />;
}
