import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LocalizedToastProvider } from "@/components/providers/localized-toast-provider";

import { CommandMenu } from "@/components/layout/command-menu";
import { DemoBanner } from "@/components/layout/demo-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { DEMO_COOKIE } from "@/lib/api/constants";
import { ApiError, getCurrentUser, renderedAuthFingerprint } from "@/lib/api/server";
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
    if (err instanceof ApiError && err.status === 401) redirect("/login?reauth=1");
    throw err;
  }

  if (user.platform_permissions?.includes("platform.read")) redirect("/platform");

  const shellUser = { name: user.full_name, email: user.email, role: user.role };
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : "uz";
  const isDemo = Boolean(cookieStore.get(DEMO_COOKIE)?.value);

  return (
    <I18nProvider initialLocale={initialLocale}>
      <LocalizedToastProvider>
        <div className="flex h-screen overflow-hidden" style={brandCssVars(user.branding)}>
          <Sidebar user={shellUser} branding={user.branding} />
          <div className="flex-1 flex flex-col overflow-hidden">
            {isDemo ? <DemoBanner /> : null}
            <TopBar user={shellUser} authFingerprint={await renderedAuthFingerprint()} />
            <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
          </div>
          <CommandMenu />
        </div>
      </LocalizedToastProvider>
    </I18nProvider>
  );
}
