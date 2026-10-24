"use client";

import Link from "next/link";
import { Car, ChevronRight, Clock } from "lucide-react";

import { useI18n } from "@/lib/i18n/context";

export type JobCard = {
  id: string;
  status: string;
  date: string | null;
  time: string;
  vehicle_label: string;
  license_plate: string | null;
  customer_name: string | null;
  service: string | null;
  note: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  pending: "bg-slate-100 text-slate-700 border-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.pending}`}>
      {t(`status.${status}`)}
    </span>
  );
}

// One job in the mechanic's queue. Big touch target, the essentials only:
// vehicle, the work, the time, and where it stands.
export function JobRow({ job }: { job: JobCard }) {
  const { t } = useI18n();
  return (
    <Link
      href={`/workshop/${job.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-[0.99] hover:border-primary/40"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Car className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-foreground">{job.vehicle_label}</p>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-0.5 truncate text-sm text-foreground/80">
          {job.service ?? job.note ?? t("workshop.no_service")}
        </p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{job.time}</span>
          {job.license_plate && <span className="tabular-nums">{job.license_plate}</span>}
          {job.customer_name && <span className="truncate">{job.customer_name}</span>}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
