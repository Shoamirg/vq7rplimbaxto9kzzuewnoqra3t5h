"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wrench } from "lucide-react";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment } from "@/lib/api/types";

export function MechanicWorkspace() {
  const { t } = useI18n();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await clientFetch<{ items: Appointment[] }>("/mechanic/work?page=1&page_size=100");
      setItems(result.items);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-foreground">{t("work.my_assignments")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("work.assignment_subtitle")}</p>
      </header>

      {failed ? (
        <div role="alert" className="rounded-xl border border-red-300 bg-card p-5 text-sm">
          <p>{t("work.assigned_load_failed")}</p>
          <button onClick={() => void load()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold">
            <RefreshCw className="size-4" />{t("work.retry_assignments")}
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("appointment.loading")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("work.no_assigned_jobs")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-semibold text-foreground">{item.customer_name}</h2>
                  <p className="mt-0.5 break-words text-sm text-muted-foreground">{item.vehicle_summary}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-semibold">{t(`status.${item.status}`)}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">{t("work.service")}</dt><dd className="mt-1 break-words">{item.service_type || t("common.general_service")}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">{t("work.when")}</dt><dd className="mt-1 break-words">{item.appointment_local_date || item.appointment_date.slice(0, 10)} · {item.appointment_time.slice(0, 5)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
