"use client";

import React from "react";
import { Avatar } from "@garageos/design-system";
import { cn } from "@garageos/design-system";
import type { Mechanic, Appointment } from "./types";
import { calculateWorkload } from "./mock-data";

interface MechanicHeaderProps {
  mechanic: Mechanic;
  appointments: Appointment[];
  compact?: boolean;
}

export function MechanicHeader({ mechanic, appointments, compact }: MechanicHeaderProps) {
  const workload = calculateWorkload(appointments, mechanic.id);
  const activeCount = appointments.filter(
    (a) => a.mechanicId === mechanic.id && a.status === "in-progress"
  ).length;
  const totalCount = appointments.filter(
    (a) => a.mechanicId === mechanic.id && a.status !== "cancelled" && a.status !== "no-show"
  ).length;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-3 border-b border-border bg-card",
        compact ? "flex-col text-center" : ""
      )}
    >
      {/* Avatar with active indicator */}
      <div className="relative shrink-0">
        <Avatar size="sm" fallback={mechanic.initials} />
        {activeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-card animate-pulse" />
        )}
      </div>

      <div className={cn("min-w-0", compact ? "text-center" : "")}>
        <p className="text-sm font-medium text-foreground truncate">{mechanic.name}</p>
        <p className={cn(
          "text-xs text-muted-foreground truncate",
          compact && "text-[10px]"
        )}>
          {mechanic.specialization}
        </p>
      </div>

      {/* Workload badge */}
      <div className={cn(
        "ml-auto text-right shrink-0",
        compact ? "ml-0 mt-1" : ""
      )}>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 w-16 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                workload >= 8 ? "bg-danger" : workload >= 6 ? "bg-warning" : "bg-success"
              )}
              style={{ width: `${Math.min((workload / 8) * 100, 100)}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-medium tabular-nums",
            workload >= 8 ? "text-danger" : workload >= 6 ? "text-warning" : "text-muted-foreground"
          )}>
            {workload.toFixed(1)}h
          </span>
        </div>
        {!compact && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {totalCount} booking{totalCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
