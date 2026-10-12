"use client";

import { ClipboardList, Clock3, Wrench } from "lucide-react";
import { Badge, cn } from "@garageos/design-system";
import type { WorkOrder } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const TONES = {
  received: "info",
  in_progress: "primary",
  ready: "warning",
  completed: "success",
  cancelled: "neutral",
} as const;

export function WorkOrderCard({
  order,
  active,
  onClick,
}: {
  order: WorkOrder;
  active: boolean;
  onClick: () => void;
}) {
  const { t, fmt } = useI18n();
  return (
    <button
      type="button"
      data-testid="work-order-card"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "w-full rounded-lg border bg-card p-4 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary",
        active ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{order.customer_name}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{order.vehicle_summary}</p>
        </div>
        <Badge variant={TONES[order.status]} size="sm" dot>
          {t(`wo.status.${order.status}`)}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Wrench className="size-3.5 shrink-0" />
          <span className="truncate">{order.service_type}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5 shrink-0" />
          {fmt.date(order.received_at)}
        </span>
        {order.assigned_mechanic_name ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <ClipboardList className="size-3.5 shrink-0" />
            <span className="truncate">{order.assigned_mechanic_name}</span>
          </span>
        ) : null}
      </div>
    </button>
  );
}
