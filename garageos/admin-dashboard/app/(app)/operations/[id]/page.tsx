import { redirect } from "next/navigation";

// Notifications link to /operations/<caseId>, but the operations console selects
// a case via the ?case= query param. Bridge the path form to the query form.
export default async function OperationsDeepLink({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/operations?case=${encodeURIComponent(id)}`);
}
