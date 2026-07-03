"use client";

import { useEffect, useState } from "react";
import { Award, Car, Mail, Phone, Store } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import type { MeResponse } from "@/lib/mini/types";
import { Card, Loading, ScreenHeader } from "@/components/mini/ui";

function fmtMonthYear(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function MePage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    miniFetch<MeResponse>("/me").then(setMe).catch(() => setMe(null));
  }, []);

  if (!me) return <div><ScreenHeader title="Me" /><Loading /></div>;

  const initials = me.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      <ScreenHeader title="Me" />

      <Card className="!p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white">
            {initials}
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{me.full_name}</p>
            <p className="text-sm text-slate-500">Member since {fmtMonthYear(me.member_since)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-amber-700">
              <Award className="size-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Loyalty</span>
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{me.loyalty_points}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3">
            <div className="flex items-center gap-1.5 text-blue-700">
              <Car className="size-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Vehicles</span>
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{me.vehicle_count}</p>
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        <Card className="!p-2">
          <ul className="divide-y divide-slate-100">
            {me.phone ? <Row icon={<Phone className="size-4" />} label="Phone" value={me.phone} /> : null}
            {me.email ? <Row icon={<Mail className="size-4" />} label="Email" value={me.email} /> : null}
            <Row icon={<Store className="size-4" />} label="Garage" value={me.garage.name} />
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
