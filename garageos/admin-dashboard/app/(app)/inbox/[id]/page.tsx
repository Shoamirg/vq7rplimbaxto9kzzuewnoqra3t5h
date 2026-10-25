import { redirect } from "next/navigation";

// Notifications link to /inbox/<conversationId> (a path segment), but the inbox
// is a single page that selects a conversation via the ?c= query param. Bridge
// the two so notification deep-links resolve instead of 404ing.
export default async function InboxDeepLink({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/inbox?c=${encodeURIComponent(id)}`);
}
