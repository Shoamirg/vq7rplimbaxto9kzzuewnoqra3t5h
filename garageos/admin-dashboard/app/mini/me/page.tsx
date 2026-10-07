"use client";

import { Award, Car, Mail, Phone, Store } from "lucide-react";

import { useMiniData } from "@/lib/mini/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { MeResponse } from "@/lib/mini/types";
import { Card, ListSkeleton, ScreenError, ScreenHeader } from "@/components/mini/ui";

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };

export default function MePage() {
  const { data: me, loading, error, reload } = useMiniData<MeResponse>("/me");
  const { t, fmt } = useI18n();

  if (error) return <div><ScreenHeader title={t("mini.me.title")} /><ScreenError onRetry={reload} /></div>;
  if (loading || !me) return <div><ScreenHeader title={t("mini.me.title")} /><ListSkeleton rows={2} /></div>;

  const initials = me.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      <ScreenHeader title={t("mini.me.title")} />

      <Card className="p-5!">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white">
            {initials}
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{me.full_name}</p>
            <p className="text-sm text-slate-500">
              {t("mini.me.member_since", { date: fmt.date(me.member_since, MONTH_YEAR) || "—" })}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-amber-700">
              <Award className="size-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide">{t("mini.me.loyalty")}</span>
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{fmt.number(me.loyalty_points)}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3">
            <div className="flex items-center gap-1.5 text-blue-700">
              <Car className="size-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide">{t("mini.me.vehicles")}</span>
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{fmt.number(me.vehicle_count)}</p>
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        <Card className="p-2!">
          <ul className="divide-y divide-slate-100">
            {me.phone ? <Row icon={<Phone className="size-4" />} label={t("mini.me.phone")} value={me.phone} /> : null}
            {me.email ? <Row icon={<Mail className="size-4" />} label={t("mini.me.email")} value={me.email} /> : null}
            <Row icon={<Store className="size-4" />} label={t("mini.me.garage")} value={me.garage.name} />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 px-2 py-3">
      <div className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-400">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </li>
  );
}
