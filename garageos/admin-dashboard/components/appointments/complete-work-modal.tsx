"use client";

import { useState } from "react";
import { CheckCheck, Loader2, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment } from "@/lib/api/types";

const FIELD = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";
const LABEL = "block text-xs font-semibold text-muted-foreground mb-1.5";

export function CompleteWorkModal({ appointment, onClose, onCompleted }: {
  appointment: Appointment;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [serviceType, setServiceType] = useState(appointment.service_type || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function complete() {
    const type = serviceType.trim();
    if (!type || saving) return;
    setSaving(true);
    try {
      await clientFetch(`/appointments/${appointment.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({ service_type: type, notes: notes.trim() || null }),
      });
      toast({ title: t("work.completed"), variant: "success" });
      onCompleted();
    } catch (error) {
      if (!(error instanceof ClientApiError && error.status === 403)) {
        toast({ title: t("work.failed"), variant: "danger" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent hideClose noPadding aria-describedby={undefined} className="max-h-[90dvh] overflow-auto sm:max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base font-bold"><CheckCheck className="size-4 text-primary" /> {t("work.complete")}</DialogTitle>
          <button onClick={onClose} disabled={saving} className="min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" aria-label={t("common.cancel")}><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <div className="font-medium">{appointment.customer_name}</div>
            <div className="text-xs text-muted-foreground">{appointment.vehicle_summary}</div>
          </div>
          <div>
            <label className={LABEL} htmlFor="complete-service-type">{t("work.performed_service")}</label>
            <input id="complete-service-type" className={FIELD} maxLength={100} required
              placeholder={t("work.performed_service_hint")} value={serviceType} onChange={(event) => setServiceType(event.target.value)} />
          </div>
          <div>
            <label className={LABEL} htmlFor="complete-notes">{t("work.performed_details")}</label>
            <textarea id="complete-notes" className={`${FIELD} resize-none`} rows={3}
              placeholder={t("work.performed_details_hint")} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" disabled={saving} onClick={onClose}>{t("common.cancel")}</Button>
          <Button size="sm" disabled={!serviceType.trim() || saving} onClick={complete}
            leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}>
            {saving ? t("common.working") : t("work.complete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
