import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@garageos/design-system";

import { CommandMenu } from "@/components/layout/command-menu";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ApiError, getCurrentUser } from "@/lib/api/server";
import { brandCssVars } from "@/lib/branding";
import { I18nProvider } from "@/lib/i18n/context";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/dictionaries";

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
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : "en";

  return (
    <I18nProvider initialLocale={initialLocale}>
      <ToastProvider position="bottom-right">
        <div className="flex h-screen overflow-hidden" style={brandCssVars(user.branding)}>
          <Sidebar user={shellUser} branding={user.branding} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar user={shellUser} />
            <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
          </div>
          <CommandMenu />
        </div>
      </ToastProvider>
    </I18nProvider>
  );
}
