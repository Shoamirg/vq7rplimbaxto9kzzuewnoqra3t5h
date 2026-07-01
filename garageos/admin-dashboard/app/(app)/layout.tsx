import { redirect } from "next/navigation";

import { CommandPaletteContent } from "@/components/layout/command-palette-content";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ApiError, getCurrentUser } from "@/lib/api/server";

// Authenticated app shell. Reads the auth cookie (via getCurrentUser) at request
// time, so it renders dynamically. /login lives outside this group and gets no shell.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/login");
    throw err;
  }

  const shellUser = { name: user.full_name, email: user.email, role: user.role };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={shellUser} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar user={shellUser} />
        <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
      </div>
      <CommandPaletteContent />
    </div>
  );
}
