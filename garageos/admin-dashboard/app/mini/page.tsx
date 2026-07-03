"use client";

import Link from "next/link";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  LifeBuoy,
  MessageSquare,
  Receipt,
} from "lucide-react";

import { useMiniData } from "@/lib/mini/hooks";
import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { HomeResponse } from "@/lib/mini/types";
import { Card, HealthRing, HomeSkeleton, ScreenError, SectionLabel } from "@/components/mini/ui";

const DAY_DATE: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };

export default function HomePage() {
  const { data: home, loading, error, reload } = useMiniData<HomeResponse>("/home");
  const { t, fmt } = useI18n();

  if (error) return <ScreenError message={t("mini.home.load_error")} onRetry={reload} />;
  if (loading || !home) return <HomeSkeleton />;

  const v = home.primary_vehicle;
  const tier = v?.passport_tier ? t(`mini.tier.${v.passport_tier}`) : null;

  return (
    <div className="space-y-5">
      <header className="px-1">
        <p className="text-sm font-medium text-slate-400">{home.garage.name}</p>
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">
          {t("mini.home.greeting", { name: home.greeting })} 👋
        </h1>
      </header>

      {/* SOS — impossible to miss */}
      <Link
        href="/mini/roadside"
        aria-label={t("mini.home.sos_title")}
        onClick={() => haptic("heavy")}
        className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-red-500 to-rose-600 p-4 text-white shadow-[0_12px_32px_-10px_rgba(220,38,38,0.6)] transition motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
      >
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20">
          <LifeBuoy className="size-7" />
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold leading-tight">{t("mini.home.sos_title")}</p>
          <p className="text-sm text-white/85">{t("mini.home.sos_sub")}</p>
        </div>
        <ChevronRight className="size-5 text-white/80" aria-hidden />
      </Link>

      {/* Upcoming appointment */}
      {home.next_appointment ? (
        <div>
          <SectionLabel>{t("mini.home.upcoming")}</SectionLabel>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <CalendarClock className="size-6" aria-hidden />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  {home.next_appointment.service_type ?? t("mini.home.appointment_default")}
                </p>
                <p className="text-sm text-slate-500">
                  {fmt.date(home.next_appointment.date, DAY_DATE)}
                  {home.next_appointment.time ? ` · ${home.next_appointment.time}` : ""}
                  {home.next_appointment.vehicle_label ? ` · ${home.next_appointment.vehicle_label}` : ""}
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Outstanding invoice */}
      {home.outstanding_balance > 0.005 ? (
        <Card href="/mini/billing" className="!bg-amber-50 !ring-amber-200/60">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
              <Receipt className="size-6" aria-hidden />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{t("mini.home.balance_due")}</p>
              <p className="text-sm text-amber-700">
                {home.outstanding_invoice
                  ? t("mini.home.invoice_n", { code: home.outstanding_invoice.code })
                  : t("mini.home.tap_to_pay")}
              </p>
            </div>
            <p className="text-lg font-bold text-slate-900">{fmt.money(home.outstanding_balance)}</p>
          </div>
        </Card>
      ) : null}

      {/* Latest message */}
      {home.latest_message ? (
        <Card href={`/mini/messages/${home.latest_message.id}`}>
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <MessageSquare className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold text-slate-900">
                  {home.latest_message.subject ?? t("mini.home.conversation")}
                </p>
                {home.latest_message.awaiting_you ? (
                  <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                ) : null}
              </div>
              <p className="truncate text-sm text-slate-500">
                {home.latest_message.preview ?? t("mini.home.open_thread")}
              </p>
            </div>
            <ChevronRight className="size-5 text-slate-300" aria-hidden />
          </div>
        </Card>
      ) : null}

      {/* Vehicle health */}
      {v ? (
        <div>
          <SectionLabel>{t("mini.home.your_vehicle")}</SectionLabel>
          <Card href={`/mini/vehicles/${v.id}`}>
            <div className="flex items-center gap-4">
              <HealthRing score={v.health_score} band={v.band} size={60} />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{v.label}</p>
                <p className="text-sm text-slate-500">
                  {tier ? `${t("mini.home.certified", { tier })} · ` : ""}
                  {t("mini.home.health_label", { band: t(`mini.band.${v.band}`) })}
                </p>
              </div>
              <ChevronRight className="size-5 text-slate-300" aria-hidden />
            </div>
          </Card>
        </div>
      ) : null}

      {/* Recent activity */}
      {home.activity.length > 0 ? (
        <div>
          <SectionLabel>{t("mini.home.recent_activity")}</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {home.activity.map((a, i) => (
                <li key={i} className="flex items-start gap-3 px-2 py-3">
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
                    <Bell className="size-4" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    {a.detail ? <p className="text-sm text-slate-500">{a.detail}</p> : null}
                    <p className="mt-0.5 text-xs text-slate-400">{fmt.date(a.date, DAY_DATE)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
