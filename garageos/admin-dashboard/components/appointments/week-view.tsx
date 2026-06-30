"use client";

import React, { useMemo } from "react";
import { cn } from "@garageos/design-system";
import { Avatar } from "@garageos/design-system";
import type { Appointment, Mechanic, FilterState } from "./types";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import { calculateWorkload } from "./mock-data";

interface WeekViewProps {
  weekStart: string; // YYYY-MM-DD (Monday)
  appointments: Appointment[];
  mechanics: Mechanic[];
  filters: FilterState;
  onAppointmentClick: (appointment: Appointment) => void;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function getDayAppointments(
  appointments: Appointment[],
  date: string,
  mechanicId: string
): Appointment[] {
  return appointments.filter(
    (a) => a.date === date && a.mechanicId === mechanicId && a.status !== "cancelled" && a.status !== "no-show"
  );
}

export function WeekView({
  weekStart,
  appointments,
  mechanics,
  filters,
  onAppointmentClick,
}: WeekViewProps) {
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today = new Date().toISOString().split("T")[0];

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (filters.mechanicId && a.mechanicId !== filters.mechanicId) return false;
      if (filters.status && a.status !== filters.status) return false;
      return true;
    });
  }, [appointments, filters]);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      {/* Header: Days of week */}
      <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-border bg-muted/20">
        <div className="p-3" />
        {weekDates.map((date, i) => (
          <div
            key={date}
            className={cn(
              "p-3 text-center border-l border-border",
              date === today && "bg-primary/5"
            )}
          >
            <p className="text-xs font-semibold text-foreground">{DAYS[i]}</p>
            <p className={cn(
              "text-lg font-bold mt-1",
              date === today ? "text-primary" : "text-foreground"
            )}>
              {new Date(date).getDate()}
            </p>
          </div>
        ))}
      </div>

      {/* Mechanic rows */}
      <div className="divide-y divide-border">
        {mechanics.map((mechanic) => (
          <div key={mechanic.id} className="grid grid-cols-[180px_repeat(7,1fr)]">
            {/* Mechanic info */}
            <div className="flex items-center gap-2 px-3 py-3 border-r border-border">
              <Avatar size="xs" fallback={mechanic.initials} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{mechanic.name}</p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1 w-12 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        calculateWorkload(appointments, mechanic.id) >= 8
                          ? "bg-danger"
                          : calculateWorkload(appointments, mechanic.id) >= 6
                            ? "bg-warning"
                            : "bg-success"
                      )}
                      style={{
                        width: `${Math.min(
                          (calculateWorkload(appointments, mechanic.id) / 10) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {calculateWorkload(appointments, mechanic.id).toFixed(1)}h
                  </span>
                </div>
              </div>
            </div>

            {/* Day columns */}
            {weekDates.map((date) => {
              const dayAppts = getDayAppointments(filteredAppointments, date, mechanic.id);
              const count = dayAppts.length;

              return (
                <div
                  key={date}
                  className={cn(
                    "p-2 border-l border-border min-h-[80px]",
                    "transition-colors hover:bg-muted/20",
                    date === today && "bg-primary/5"
                  )}
                >
                  {count > 0 ? (
                    <div className="space-y-1">
                      {dayAppts.slice(0, 3).map((apt) => (
                        <button
                          key={apt.id}
                          onClick={() => onAppointmentClick(apt)}
                          className={cn(
                            "w-full text-left px-1.5 py-1 rounded text-[10px] font-medium truncate border-l-2 transition-colors hover:opacity-80",
                            STATUS_COLORS[apt.status].bg,
                            STATUS_COLORS[apt.status].border.replace("border", "border-l")
                          )}
                        >
                          <span className="text-foreground">{apt.service}</span>
                          <span className="text-muted-foreground ml-1">
                            {apt.startTime}
                          </span>
                        </button>
                      ))}
                      {count > 3 && (
                        <p className="text-[9px] text-muted-foreground text-center font-medium">
                          +{count - 3} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground/30">—</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
