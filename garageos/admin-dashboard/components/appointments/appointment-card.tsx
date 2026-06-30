"use client";

import React, { useCallback, type DragEvent } from "react";
import { Car, Clock, GripVertical } from "lucide-react";
import { cn } from "@garageos/design-system";
import type { Appointment } from "./types";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import { formatTimeDisplay, timeToMinutes, minutesToTime } from "./mock-data";

interface AppointmentCardProps {
  appointment: Appointment;
  top: number;
  height: number;
  left?: string;
  width?: string;
  onClick?: (appointment: Appointment) => void;
  onDragStart?: (appointment: Appointment) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  isConflict?: boolean;
  compact?: boolean;
}

export function AppointmentCard({
  appointment,
  top,
  height,
  left,
  width,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  isConflict,
  compact,
}: AppointmentCardProps) {
  const colors = STATUS_COLORS[appointment.status];
  const endMinutes = timeToMinutes(appointment.startTime) + appointment.durationMinutes;
  const endTime = minutesToTime(endMinutes);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData("text/plain", appointment.id);
      e.dataTransfer.effectAllowed = "move";
      onDragStart?.(appointment);
    },
    [appointment, onDragStart]
  );

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded-lg border px-2.5 py-1.5 cursor-pointer select-none",
        "transition-shadow duration-150 hover:shadow-md",
        "group",
        colors.bg,
        colors.border,
        isConflict && "ring-2 ring-danger ring-offset-1",
        isDragging && "opacity-50 shadow-lg z-50",
        !isDragging && "z-10"
      )}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 28)}px`,
        left,
        width,
      }}
      onClick={() => onClick?.(appointment)}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      aria-label={`${appointment.service} for ${appointment.customerName}`}
    >
      {/* Drag handle (visible on hover) */}
      <div className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="size-3" />
      </div>

      <div className={cn(compact ? "pl-0" : "pl-3")}>
        {/* Service name */}
        <p className={cn(
          "font-medium leading-tight truncate",
          compact ? "text-[10px]" : "text-xs",
          colors.text
        )}>
          {appointment.service}
        </p>

        {/* Customer + Vehicle */}
        {!compact && (
          <div className="flex items-center gap-1 mt-0.5">
            <Car className="size-2.5 text-muted-foreground shrink-0" />
            <p className="text-[10px] text-foreground truncate">{appointment.vehicleName}</p>
          </div>
        )}

        {/* Plate + Time row */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn(
            "font-mono font-medium",
            compact ? "text-[8px]" : "text-[10px]",
            "text-muted-foreground"
          )}>
            {appointment.licensePlate}
          </span>
          {!compact && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Clock className="size-2.5" />
                {formatTimeDisplay(appointment.startTime)}–{formatTimeDisplay(endTime)}
              </span>
            </>
          )}
        </div>

        {/* Status badge (compact: dot only) */}
        {compact ? (
          <span className={cn("inline-block size-1.5 rounded-full absolute top-1 right-1", colors.dot)} />
        ) : (
          <div className="flex items-center gap-1.5 mt-1">
            <span className={cn("inline-block size-1.5 rounded-full", colors.dot)} />
            <span className="text-[9px] text-muted-foreground">{STATUS_LABELS[appointment.status]}</span>
          </div>
        )}
      </div>
    </div>
  );
}


