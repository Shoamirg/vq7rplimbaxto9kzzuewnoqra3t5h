"use client";

import React, { useState, useCallback, useRef, useMemo, type DragEvent } from "react";
import { cn } from "@garageos/design-system";
import { MechanicHeader } from "./mechanic-header";
import { AppointmentCard } from "./appointment-card";
import type { Appointment, Mechanic, DragState, ConflictInfo, FilterState } from "./types";
import {
  generateTimeSlots,
  timeToMinutes,
  appointmentsConflict,
  minutesToTime,
} from "./mock-data";

const HOUR_HEIGHT = 72; // px per hour
const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2;
const START_HOUR = 6; // 6:00 AM
const END_HOUR = 20; // 8:00 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const BUFFER_MINUTES = 15; // buffer between appointments

interface DayViewProps {
  date: string;
  appointments: Appointment[];
  mechanics: Mechanic[];
  filters: FilterState;
  onAppointmentClick: (appointment: Appointment) => void;
  onAppointmentDrop: (appointmentId: string, mechanicId: string, startTime: string) => void;
  onSlotClick: (mechanicId: string, startTime: string) => void;
}

export function DayView({
  date,
  appointments,
  mechanics,
  filters,
  onAppointmentClick,
  onAppointmentDrop,
  onSlotClick,
}: DayViewProps) {
  const [dragState, setDragState] = useState<DragState>({
    appointmentId: null,
    startMechanicId: null,
    startTime: null,
    currentMechanicId: null,
    currentTime: null,
    isDragging: false,
    conflicts: [],
  });

  const [hoveredSlot, setHoveredSlot] = useState<{ mechanicId: string; time: string } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const timeSlots = useMemo(() => generateTimeSlots(), []);

  // Filter appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (filters.mechanicId && a.mechanicId !== filters.mechanicId) return false;
      if (filters.status && a.status !== filters.status) return false;
      if (filters.serviceType && a.service !== filters.serviceType) return false;
      return true;
    });
  }, [appointments, filters]);

  // Get appointment position in pixels
  const getAppointmentPosition = useCallback((appointment: Appointment) => {
    const startMinutes = timeToMinutes(appointment.startTime);
    const startFrom6AM = startMinutes - START_HOUR * 60;
    const top = (startFrom6AM / 60) * HOUR_HEIGHT;
    const height = (appointment.durationMinutes / 60) * HOUR_HEIGHT;
    return { top, height };
  }, []);

  // Check if a time slot has a conflict
  const hasConflict = useCallback(
    (mechanicId: string, startTime: string, excludeId?: string): ConflictInfo | null => {
      const startMinutes = timeToMinutes(startTime);
      const tempAppointment: Appointment = {
        id: excludeId || "temp",
        customerName: "",
        vehicleName: "",
        licensePlate: "",
        service: "",
        status: "pending",
        mechanicId,
        date,
        startTime,
        durationMinutes: 30, // default check duration
        bay: 1,
      };

      for (const apt of appointments) {
        if (excludeId && apt.id === excludeId) continue;
        if (apt.mechanicId !== mechanicId) continue;
        if (apt.status === "cancelled" || apt.status === "no-show") continue;
        if (appointmentsConflict(tempAppointment, apt)) {
          return {
            appointmentId: excludeId || "temp",
            conflictingWith: apt.id,
            reason: `Overlaps with ${apt.customerName}'s ${apt.service} (${apt.startTime})`,
          };
        }
      }
      return null;
    },
    [appointments, date]
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (appointment: Appointment) => {
      setDragState({
        appointmentId: appointment.id,
        startMechanicId: appointment.mechanicId,
        startTime: appointment.startTime,
        currentMechanicId: appointment.mechanicId,
        currentTime: appointment.startTime,
        isDragging: true,
        conflicts: [],
      });
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    if (dragState.appointmentId && dragState.currentMechanicId && dragState.currentTime) {
      const isDifferent =
        dragState.currentMechanicId !== dragState.startMechanicId ||
        dragState.currentTime !== dragState.startTime;

      if (isDifferent && dragState.conflicts.length === 0) {
        onAppointmentDrop(
          dragState.appointmentId,
          dragState.currentMechanicId,
          dragState.currentTime
        );
      }
    }
    setDragState({
      appointmentId: null,
      startMechanicId: null,
      startTime: null,
      currentMechanicId: null,
      currentTime: null,
      isDragging: false,
      conflicts: [],
    });
  }, [dragState, onAppointmentDrop]);

  const handleDrop = useCallback(
    (mechanicId: string, time: string) => {
      if (!dragState.appointmentId) return;

      const conflict = hasConflict(mechanicId, time, dragState.appointmentId);
      if (conflict) {
        setDragState((prev) => ({
          ...prev,
          currentMechanicId: mechanicId,
          currentTime: time,
          conflicts: [conflict.conflictingWith],
        }));
        return;
      }

      const isDifferent = mechanicId !== dragState.startMechanicId || time !== dragState.startTime;

      if (isDifferent) {
        onAppointmentDrop(dragState.appointmentId, mechanicId, time);
      }

      setDragState({
        appointmentId: null,
        startMechanicId: null,
        startTime: null,
        currentMechanicId: null,
        currentTime: null,
        isDragging: false,
        conflicts: [],
      });
    },
    [dragState, hasConflict, onAppointmentDrop]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // Snap to 30-min grid
  const snapToGrid = useCallback((y: number): number => {
    const minutes = (y / HOUR_HEIGHT) * 60;
    const snapped = Math.round(minutes / 30) * 30;
    return snapped;
  }, []);

  // Get time from mouse position
  const getTimeFromPosition = useCallback(
    (y: number): string => {
      const minutes = snapToGrid(y);
      const totalMinutes = START_HOUR * 60 + minutes;
      return minutesToTime(totalMinutes);
    },
    [snapToGrid]
  );

  // Current time indicator
  const [currentTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  const currentTimeTop = useMemo(() => {
    const minutes = timeToMinutes(currentTime) - START_HOUR * 60;
    return (minutes / 60) * HOUR_HEIGHT;
  }, [currentTime]);

  return (
    <div className="flex flex-col rounded-lg border border-border overflow-hidden bg-card">
      {/* Scrollable timeline area */}
      <div className="overflow-y-auto overflow-x-hidden" ref={timelineRef} style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div className="relative" style={{ minHeight: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Grid layout: time column + mechanic columns */}
          <div className="flex">
            {/* Time gutter */}
            <div className="w-16 shrink-0 relative">
              {/* Current time indicator label */}
              {currentTimeTop >= 0 && currentTimeTop <= TOTAL_HOURS * HOUR_HEIGHT && (
                <div
                  className="absolute right-2 z-20 pointer-events-none"
                  style={{ top: `${currentTimeTop - 7}px` }}
                >
                  <span className="text-[10px] font-medium text-danger">{currentTime}</span>
                </div>
              )}
              {/* Hour labels */}
              {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
                const hour = START_HOUR + i;
                const label = hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`;
                return (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 text-right pr-2"
                    style={{ top: `${i * HOUR_HEIGHT - 7}px` }}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Mechanic columns */}
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${mechanics.length}, 1fr)` }}>
              {mechanics.map((mechanic) => {
                const mechAppts = filteredAppointments.filter((a) => a.mechanicId === mechanic.id);
                const isDropTarget = true;

                return (
                  <div
                    key={mechanic.id}
                    className={cn(
                      "relative border-l border-border first:border-l-0",
                      dragState.isDragging && "bg-muted/10"
                    )}
                    onDragOver={handleDragOver}
                    onDrop={(e) => {
                      const time = getTimeFromPosition(e.clientY - (timelineRef.current?.getBoundingClientRect().top || 0) + (timelineRef.current?.scrollTop || 0));
                      handleDrop(mechanic.id, time);
                    }}
                  >
                    {/* Mechanic header at top of column */}
                    <div className="sticky top-0 z-30 bg-card shadow-sm">
                      <MechanicHeader
                        mechanic={mechanic}
                        appointments={filteredAppointments}
                        compact
                      />
                    </div>

                    {/* Drop zone grid (half-hour rows) */}
                    <div className="relative">
                      {/* Half-hour grid lines */}
                      {Array.from({ length: TOTAL_HOURS * 2 }).map((_, i) => {
                        const hourIdx = Math.floor(i / 2);
                        const isHalfHour = i % 2 === 1;
                        const top = i * HALF_HOUR_HEIGHT;
                        const totalMinutes = START_HOUR * 60 + i * 30;
                        const timeStr = minutesToTime(totalMinutes);

                        return (
                          <div
                            key={i}
                            className={cn(
                              "absolute left-0 right-0 border-t",
                              isHalfHour ? "border-border/30 border-dashed" : "border-border",
                              "cursor-pointer hover:bg-primary/5 transition-colors"
                            )}
                            style={{ top: `${top}px`, height: `${HALF_HOUR_HEIGHT}px` }}
                            onClick={() => onSlotClick(mechanic.id, timeStr)}
                            onMouseEnter={() => setHoveredSlot({ mechanicId: mechanic.id, time: timeStr })}
                            onMouseLeave={() => setHoveredSlot(null)}
                          >
                            {/* Hover indicator */}
                            {hoveredSlot?.mechanicId === mechanic.id && hoveredSlot?.time === timeStr && (
                              <div className="absolute inset-0 bg-primary/5 flex items-center justify-center">
                                <span className="text-[10px] text-primary font-medium opacity-50">+</span>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Buffer time indicators (15min before/after each appointment) */}
                      {mechAppts.map((apt) => {
                        const { top, height } = getAppointmentPosition(apt);
                        return (
                          <React.Fragment key={`buffer-${apt.id}`}>
                            <div
                              className="absolute left-0 right-0 bg-muted/20"
                              style={{
                                top: `${top - (BUFFER_MINUTES / 60) * HOUR_HEIGHT}px`,
                                height: `${(BUFFER_MINUTES / 60) * HOUR_HEIGHT}px`,
                              }}
                            />
                            <div
                              className="absolute left-0 right-0 bg-muted/20"
                              style={{
                                top: `${top + height}px`,
                                height: `${(BUFFER_MINUTES / 60) * HOUR_HEIGHT}px`,
                              }}
                            />
                          </React.Fragment>
                        );
                      })}

                      {/* Appointment cards */}
                      {mechAppts.map((apt) => {
                        const { top, height } = getAppointmentPosition(apt);
                        const isConflicting = dragState.conflicts.includes(apt.id);

                        return (
                          <AppointmentCard
                            key={apt.id}
                            appointment={apt}
                            top={top}
                            height={height}
                            onClick={onAppointmentClick}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            isDragging={dragState.appointmentId === apt.id}
                            isConflict={isConflicting}
                          />
                        );
                      })}

                      {/* Current time indicator line */}
                      {currentTimeTop >= 0 && currentTimeTop <= TOTAL_HOURS * HOUR_HEIGHT && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top: `${currentTimeTop}px` }}
                        >
                          <div className="flex items-center">
                            <div className="size-2 rounded-full bg-danger" />
                            <div className="flex-1 h-px bg-danger" />
                          </div>
                        </div>
                      )}

                      {/* Conflict toast */}
                      {dragState.conflicts.length > 0 && (
                        <div className="absolute top-2 left-2 right-2 z-50 bg-danger/10 border border-danger/30 rounded-lg p-2 text-xs text-danger font-medium animate-fade-in">
                          ⚠ Conflict detected: time overlaps with another booking
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
