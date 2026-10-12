"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Check, Loader2, Play, X } from "lucide-react";
import { Badge, Button, useToast } from "@garageos/design-system";
import { ClientApiError, clientFetch } from "@/lib/api/client";
import type { WorkOrder, WorkOrderStatus } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const LABEL = "mb-1.5 block text-xs font-semibold text-muted-foreground";
const FIELD = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";

export function WorkOrderDetail({
  order,
  role,
  onUpdated,
  onClose,
}: {
  order: WorkOrder;
  role: string;
  onUpdated: (order: WorkOrder) => void;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const isOffice = ["admin", "manager", "receptionist"].includes(role);
  const [work, setWork] = useState(order.work_performed ?? "");
  const [odometer, setOdometer] = useState(order.completion_odometer_km?.toString() ?? "");
  const [cost, setCost] = useState(order.actual_cost?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWork(order.work_performed ?? "");
    setOdometer(order.completion_odometer_km?.toString() ?? "");
    setCost(order.actual_cost?.toString() ?? "");
  }, [order]);

  async function update(body: Partial<Pick<WorkOrder, "status" | "work_performed" | "completion_odometer_km" | "actual_cost">>) {
    setSaving(true);
    try {
      const updated = await clientFetch<WorkOrder>(`/work-orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onUpdated(updated);
    } catch (error) {
      if (!(error instanceof ClientApiError && error.status === 403)) {
        toast({ title: t("wo.operation_failed"), variant: "danger" });
      }
    } finally {
      setSaving(false);
    }
  }

  function ready() {
    if (!work.trim()) return;
    const body: Parameters<typeof update>[0] = { status: "ready", work_performed: work.trim() };
    if (isOffice && odometer !== "") body.completion_odometer_km = Number(odometer);
    if (isOffice && cost !== "") body.actual_cost = Number(cost);
    void update(body);
  }

  const editable = order.status === "in_progress" || (isOffice && order.status === "received");
  const statusTone: Record<WorkOrderStatus, "info" | "primary" | "warning" | "success" | "neutral"> = {
    received: "info", in_progress: "primary", ready: "warning", completed: "success", cancelled: "neutral",
  };

  return (
    <aside aria-label={t("wo.order_details")} className="min-w-0 rounded-lg border border-border bg-card xl:sticky xl:top-4 xl:self-start">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="wrap-break-word text-lg font-bold leading-snug text-foreground">{order.customer_name}</h2>
            <p className="mt-1 wrap-break-word text-sm text-muted-foreground">{order.vehicle_summary}</p>
          </div>
          <button type="button" onClick={onClose} className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary xl:grid" aria-label={t("wo.close")}>
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Badge variant={statusTone[order.status]} dot>{t(`wo.status.${order.status}`)}</Badge>
          <Button type="button" size="sm" variant="ghost" className="xl:hidden" onClick={onClose} leftIcon={<ArrowLeft className="size-4" />}>
            {t("wo.back_queue")}
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("wo.service")}</p>
            <p className="mt-1 font-medium text-foreground">{order.service_type}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("wo.mechanic")}</p>
            <p className="mt-1 truncate font-medium text-foreground">{order.assigned_mechanic_name ?? t("wo.unassigned")}</p>
          </div>
        </div>
        {order.appointment_id ? (
          <Link href="/appointments" className="inline-flex items-center gap-2 text-xs text-primary hover:underline">
            <CalendarDays className="size-3.5" /> {t("wo.linked_appointment")}
          </Link>
        ) : null}
        {order.customer_concern ? (
          <div className="rounded-md bg-muted/60 p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("wo.concern")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{order.customer_concern}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <p>{t("wo.intake_km")}: <span className="font-medium text-foreground">{order.intake_odometer_km ?? "—"}</span></p>
          <p>{t("wo.received_at")}: <span className="font-medium text-foreground">{fmt.date(order.received_at)}</span></p>
        </div>

        <div>
          <label className={LABEL} htmlFor="wo-work-performed">{t("wo.work_performed")}</label>
          <textarea id="wo-work-performed" rows={3} value={work} onChange={(event) => setWork(event.target.value)} disabled={!editable || saving}
            placeholder={t("wo.work_placeholder")} className={`${FIELD} resize-y disabled:opacity-70`} />
        </div>
        <div className={isOffice ? "grid grid-cols-2 gap-3" : ""}>
          {isOffice ? (
            <div>
              <label className={LABEL} htmlFor="wo-completion-km">{t("wo.completion_km")}</label>
              <input id="wo-completion-km" type="number" min={order.intake_odometer_km ?? 0} step="1" value={odometer}
                onChange={(event) => setOdometer(event.target.value)} disabled={!editable || saving} className={`${FIELD} disabled:opacity-70`} />
            </div>
          ) : null}
          {isOffice ? (
            <div>
              <label className={LABEL} htmlFor="wo-actual-cost">{t("wo.actual_cost")}</label>
              <input id="wo-actual-cost" type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)}
                disabled={!editable || saving} className={`${FIELD} disabled:opacity-70`} />
            </div>
          ) : null}
        </div>
        {order.service_record_id ? <p className="text-xs text-muted-foreground">{t("wo.history_saved")}</p> : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {order.status === "received" ? (
            <Button size="sm" loading={saving} onClick={() => void update({ status: "in_progress" })} leftIcon={<Play className="size-4" />}>
              {t("wo.start")}
            </Button>
          ) : null}
          {order.status === "in_progress" ? (
            <>
              <Button size="sm" variant="outline" disabled={saving || !work.trim()} onClick={() => ready()} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}>
                {t("wo.mark_ready")}
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void update({ work_performed: work.trim(), ...(isOffice && odometer ? { completion_odometer_km: Number(odometer) } : {}), ...(isOffice && cost ? { actual_cost: Number(cost) } : {}) })}>
                {t("wo.save")}
              </Button>
            </>
          ) : null}
          {order.status === "ready" && isOffice ? (
            <Button size="sm" loading={saving} onClick={() => void update({ status: "completed" })} leftIcon={<Check className="size-4" />}>
              {t("wo.handoff")}
            </Button>
          ) : null}
          {order.status === "received" && isOffice ? (
            <Button size="sm" variant="ghost" loading={saving} onClick={() => void update({ status: "cancelled" })}>
              {t("wo.cancel")}
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
