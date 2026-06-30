"use client";

import React, { useMemo } from "react";
import { cn } from "@garageos/design-system";
import type { Appointment, Mechanic } from "./types";
import { STATUS_COLORS } from "./types";

interface MonthViewProps {
  month: string; // YYYY-MM
  appointments: Appointment[];
  onDateClick: (date: string) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];

  // Leading empty days
  for (let i = 0; i < firstDay; i++) week.push(null);

  // Fill days
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  // Trailing empty days
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return weeks;
}

function getDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function MonthView({ month, appointments, onDateClick }: MonthViewProps) {
  const [year, monthIdx] = month.split("-").map(Number);
  const today = new Date().toISOString().split("T")[0];
  const weeks = useMemo(() => getMonthGrid(year, monthIdx - 1), [year, monthIdx]);

  // Group appointments by date
  const apptsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const apt of appointments) {
      const existing = map.get(apt.date) || [];
      existing.push(apt);
      map.set(apt.date, existing);
    }
    return map;
  }, [appointments]);

  // Count statuses for a date
  const getStatusCounts = (date: string) => {
    const dayAppts = apptsByDate.get(date) || [];
    const counts: Record<string, number> = {};
    for (const apt of dayAppts) {
      counts[apt.status] = (counts[apt.status] || 0) + 1;
    }
    return { total: dayAppts.length, counts };
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/20">
        {DAY_NAMES.map((day) => (
          <div key={day} className="p-2 text-center">
            <span className="text-xs font-medium text-muted-foreground">{day}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="divide-y divide-border">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7 divide-x divide-border">
            {week.map((day, dayIdx) => {
              if (day === null) {
                return <div key={`empty-${weekIdx}-${dayIdx}`} className="min-h-[90px] bg-muted/10" />;
              }

              const date = getDateString(year, monthIdx - 1, day);
              const { total, counts } = getStatusCounts(date);
              const isToday = date === today;

              return (
                <button
                  key={date}
                  onClick={() => onDateClick(date)}
                  className={cn(
                    "min-h-[90px] p-1.5 text-left transition-colors hover:bg-muted/20 relative group",
                    isToday && "bg-primary/5"
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center size-6 rounded-full text-xs font-medium",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                    )}
                  >
                    {day}
                  </span>

                  {/* Appointment indicators */}
                  {total > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {/* Status dots */}
                      {Object.entries(counts).slice(0, 3).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-1">
                          <span className={cn(
                            "inline-block size-1.5 rounded-full shrink-0",
                            STATUS_COLORS[status as keyof typeof STATUS_COLORS]?.dot || "bg-muted-foreground"
                          )} />
                          <span className="text-[9px] text-muted-foreground">{count}</span>
                        </div>
                      ))}
                      {total > 3 && (
                        <span className="text-[8px] text-muted-foreground font-medium">
                          +{total - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Hover: total count */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded pointer-events-none">
                    <span className="text-xs font-medium text-foreground">
                      {total} appointment{total !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
