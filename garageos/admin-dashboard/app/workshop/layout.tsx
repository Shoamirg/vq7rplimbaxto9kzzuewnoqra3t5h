import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@garageos/design-system";

import { ApiError, getCurrentUser, renderedAuthFingerprint } from "@/lib/api/server";
import { brandCssVars } from "@/lib/branding";
import { I18nProvider } from "@/lib/i18n/context";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/dictionaries";
import { WorkshopHeader } from "@/components/workshop/workshop-header";

// The Mechanic App — a separate surface from the advisor dashboard. A mechanic
// lands here (the advisor layout redirects them), sees only their own jobs, and
// works through them. Mobile-first: a mechanic is on the shop floor with a phone.
export const dynamic = "force-dynamic";

export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/login?reauth=1");
    throw err;
  }

  if (user.role !== "mechanic") redirect("/dashboard");

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : "uz";

  return (
    <I18nProvider initialLocale={initialLocale}>
      <ToastProvider position="bottom-center">
        <div
          className="min-h-screen bg-muted/40"
          style={brandCssVars(user.branding)}
        >
          <WorkshopHeader
            mechanicName={user.full_name}
            garageName={user.branding?.name ?? "GarageOS"}
            authFingerprint={await renderedAuthFingerprint()}
          />
          <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-4">{children}</main>
        </div>
      </ToastProvider>
    </I18nProvider>
  );
}
