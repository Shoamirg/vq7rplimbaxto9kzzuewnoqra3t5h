import { InboxWorkspace } from "@/components/inbox/inbox-workspace";

export const dynamic = "force-dynamic";

// The Unified Inbox — home of work, on the live UCP backend (/api/v1/conversations).
export default function InboxPage() {
  return (
    <div className="h-full">
      <InboxWorkspace />
    </div>
  );
}
