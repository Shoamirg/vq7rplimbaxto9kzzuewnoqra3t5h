"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Car, Phone, Gauge, Clock, Play, CheckCircle2, Loader2, User } from "lucide-react";
import { Button, useToast } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { StatusBadge, type JobCard } from "./job-card";

type JobDetailData = JobCard & {
  vehicle_id: string | null;
  current_km: number | null;
  customer_phone: string | null;
  estimated_duration_minutes: number | null;
  total_cost: number | null;
  staff_notes: string | null;
};

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function JobDetail({ jobId }: { jobId: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { toast } = useToast();
  const [job, setJob] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [odometer, setOdometer] = useState("");

  useEffect(() => {
    clientFetch<JobDetailData>(`/workshop/jobs/${jobId}`)
      .then((d) => {
        setJob(d);
        if (d.current_km != null) setOdometer(String(d.current_km));
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [jobId]);

  async function start() {
    setBusy(true);
    try {
      const updated = await clientFetch<JobDetailData>(`/workshop/jobs/${jobId}/start`, { method: "POST" });
      setJob((j) => (j ? { ...j, status: updated.status } : j));
      toast({ title: t("workshop.started"), variant: "success" });
    } catch {
      toast({ title: t("workshop.action_error"), variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      const km = odometer.trim() ? Number(odometer) : undefined;
      await clientFetch(`/workshop/jobs/${jobId}/finish`, {
        method: "POST",
        body: JSON.stringify({ odometer_km: Number.isFinite(km) ? km : null }),
      });
      toast({ title: t("workshop.finished"), variant: "success" });
      router.push("/workshop");
    } catch {
      toast({ title: t("workshop.action_error"), variant: "danger" });
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (!job) {
    return (
      <div className="py-20 text-center">
        <p className="font-semibold text-foreground">{t("workshop.not_found")}</p>
        <button onClick={() => router.push("/workshop")} className="mt-3 text-sm text-primary underline">{t("workshop.back")}</button>
      </div>
    );
  }

  const active = job.status === "in_progress";
  const startable = job.status === "pending" || job.status === "confirmed";

  return (
    <div className="space-y-4">
      <button onClick={() => router.push("/workshop")} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("workshop.back")}
      </button>

      {/* Job header */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">{job.vehicle_label}</h1>
            <p className="mt-0.5 text-sm text-foreground/80">{job.service ?? t("workshop.no_service")}</p>
          </div>
          <StatusBadge status={job.status} />
        </div>
        {job.note && (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground/90">{job.note}</p>
        )}
      </div>

      {/* Facts */}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {job.customer_name && <Field icon={<User className="size-4" />} label={t("workshop.customer")} value={job.customer_name} />}
        {job.customer_phone && <Field icon={<Phone className="size-4" />} label={t("workshop.phone")} value={job.customer_phone} />}
        {job.license_plate && <Field icon={<Car className="size-4" />} label={t("workshop.plate")} value={job.license_plate} />}
        {job.current_km != null && <Field icon={<Gauge className="size-4" />} label={t("workshop.odometer")} value={`${fmt.number(job.current_km)} km`} />}
        {job.estimated_duration_minutes != null && <Field icon={<Clock className="size-4" />} label={t("workshop.duration")} value={`${job.estimated_duration_minutes} min`} />}
      </div>

      {/* Actions */}
      {active && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("workshop.final_odometer")}</label>
          <input
            type="number"
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder={t("workshop.odometer")}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      <div className="sticky bottom-4">
        {startable && (
          <Button size="lg" disabled={busy} onClick={start} className="w-full"
            leftIcon={busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}>
            {t("workshop.start")}
          </Button>
        )}
        {active && (
          <Button size="lg" disabled={busy} onClick={finish} className="w-full"
            leftIcon={busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}>
            {t("workshop.finish")}
          </Button>
        )}
        {job.status === "completed" && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="size-5" /> {t("workshop.done")}
          </div>
        )}
      </div>
    </div>
  );
}
