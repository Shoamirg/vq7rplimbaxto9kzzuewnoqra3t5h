import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@garageos/design-system";

import { CommandMenu } from "@/components/layout/command-menu";
import { DemoBanner } from "@/components/layout/demo-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { AuthProvider } from "@/lib/auth/context";
import { DEMO_COOKIE } from "@/lib/api/constants";
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
    // Invalid/expired cookie: clear it via the logout route, then land on /login.
    // Redirecting straight to /login would loop — middleware sees the still-present
    // cookie and bounces back here.
    if (err instanceof ApiError && err.status === 401) redirect("/api/auth/logout");
    throw err;
  }

  // Mechanics get their own app (Today's Jobs → Start/Finish), not the advisor
  // dashboard. Their work lives at /workshop.
  if (user.role === "mechanic") redirect("/workshop");

  const shellUser = { name: user.full_name, email: user.email, role: user.role };
  const authUser = {
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: user.role,
    isSuperAdmin: user.is_super_admin,
  };
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : "en";
  const isDemo = Boolean(cookieStore.get(DEMO_COOKIE)?.value);

  return (
    <I18nProvider initialLocale={initialLocale}>
      <AuthProvider user={authUser}>
        <ToastProvider position="bottom-right">
          <div className="flex h-screen overflow-hidden" style={brandCssVars(user.branding)}>
            <Sidebar user={shellUser} branding={user.branding} />
            <div className="flex-1 flex flex-col overflow-hidden">
              {isDemo ? <DemoBanner /> : null}
              <TopBar user={shellUser} />
              <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
            </div>
            <CommandMenu />
          </div>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
