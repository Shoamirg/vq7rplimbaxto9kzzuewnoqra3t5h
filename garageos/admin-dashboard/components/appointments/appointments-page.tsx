"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  Columns3,
  Grid3X3,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@garageos/design-system";
import { Button, Badge } from "@garageos/design-system";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { MonthView } from "./month-view";
import { BookingModal } from "./booking-modal";
import { mechanics, generateAppointments } from "./mock-data";
import type { CalendarView, Appointment, FilterState, BookingFormData } from "./types";
import { STATUS_LABELS } from "./types";

const VIEW_OPTIONS: { value: CalendarView; label: string; icon: React.ElementType }[] = [
  { value: "day", label: "Day", icon: List },
  { value: "week", label: "Week", icon: Columns3 },
  { value: "month", label: "Month", icon: Grid3X3 },
];

// ─── Generate demo appointments ───────────────────────────────
const demoToday = "2026-07-01";
const demoAppointments = generateAppointments(demoToday);
// Generate a few days around today
const extraAppointments = [
  ...generateAppointments("2026-06-29"),
  ...generateAppointments("2026-06-30"),
  ...demoAppointments,
  ...generateAppointments("2026-07-02"),
  ...generateAppointments("2026-07-03"),
  ...generateAppointments("2026-07-05"),
  ...generateAppointments("2026-07-06"),
  ...generateAppointments("2026-07-07"),
];

// Deduplicate by removing exact duplicates
const allAppointments = extraAppointments.filter(
  (apt, i, arr) => arr.findIndex((a) => a.id === apt.id) === i
);

export function AppointmentsPage() {
  const [view, setView] = useState<CalendarView>("day");
  const [currentDate, setCurrentDate] = useState(demoToday);
  const [appointments, setAppointments] = useState<Appointment[]>(allAppointments);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<{
    mechanicId?: string;
    startTime?: string;
    date?: string;
  } | undefined>(undefined);
  const [filters, setFilters] = useState<FilterState>({
    mechanicId: null,
    status: null,
    serviceType: null,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Navigate days/weeks/months
  const navigate = useCallback(
    (direction: "prev" | "next") => {
      const d = new Date(currentDate);
      if (view === "day") {
        d.setDate(d.getDate() + (direction === "next" ? 1 : -1));
      } else if (view === "week") {
        d.setDate(d.getDate() + (direction === "next" ? 7 : -7));
      } else {
        d.setMonth(d.getMonth() + (direction === "next" ? 1 : -1));
      }
      setCurrentDate(d.toISOString().split("T")[0]);
    },
    [view, currentDate]
  );

  // Get week start (Monday)
  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  }, [currentDate]);

  // Get month string for month view
  const monthStr = useMemo(() => {
    return currentDate.slice(0, 7); // YYYY-MM
  }, [currentDate]);

  // Format current date for display
  const dateDisplay = useMemo(() => {
    const d = new Date(currentDate);
    const options: Intl.DateTimeFormatOptions =
      view === "day"
        ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
        : view === "week"
          ? { month: "long", year: "numeric" }
          : { month: "long", year: "numeric" };
    return d.toLocaleDateString("en-US", options);
  }, [currentDate, view]);

  // Go to today
  const goToToday = useCallback(() => {
    setCurrentDate(new Date().toISOString().split("T")[0]);
  }, []);

  // Handle slot click → open booking modal
  const handleSlotClick = useCallback(
    (mechanicId: string, startTime: string) => {
      setBookingPrefill({ mechanicId, startTime, date: currentDate });
      setBookingOpen(true);
    },
    [currentDate]
  );

  // Handle appointment drop
  const handleAppointmentDrop = useCallback(
    (appointmentId: string, mechanicId: string, startTime: string) => {
      setAppointments((prev) =>
        prev.map((apt) =>
          apt.id === appointmentId ? { ...apt, mechanicId, startTime } : apt
        )
      );
    },
    []
  );

  // Handle booking save
  const handleBookingSave = useCallback(
    (data: BookingFormData) => {
      const newAppointment: Appointment = {
        id: `apt-new-${Date.now()}`,
        customerName: data.customerName,
        vehicleName: data.vehicleName,
        licensePlate: data.licensePlate,
        service: data.service,
        status: "confirmed",
        mechanicId: data.mechanicId,
        date: data.date,
        startTime: data.startTime,
        durationMinutes: data.durationMinutes,
        notes: data.notes || undefined,
        bay: 1,
      };
      setAppointments((prev) => [...prev, newAppointment]);
    },
    []
  );

  // Handle appointment click → show details (bonus)
  const handleAppointmentClick = useCallback((appointment: Appointment) => {
    // For now, could open a detail view or edit modal
    console.log("Appointment clicked:", appointment);
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({ mechanicId: null, status: null, serviceType: null });
  }, []);

  const hasActiveFilters = filters.mechanicId || filters.status || filters.serviceType;

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage appointments, assign mechanics, and track daily workload
          </p>
        </div>
        <Button
          size="sm"
          leftIcon={<CalendarIcon className="size-4" />}
          onClick={() => {
            setBookingPrefill(undefined);
            setBookingOpen(true);
          }}
        >
          New Appointment
        </Button>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Navigation */}
        <div className="flex items-center rounded-lg border border-border bg-card">
          <button
            onClick={() => navigate("prev")}
            className="p-2 hover:bg-muted rounded-l-lg transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="size-4 text-foreground" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors border-x border-border"
          >
            Today
          </button>
          <button
            onClick={() => navigate("next")}
            className="p-2 hover:bg-muted rounded-r-lg transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="size-4 text-foreground" />
          </button>
        </div>

        {/* Date display */}
        <span className="text-sm font-semibold text-foreground min-w-[200px]">
          {dateDisplay}
        </span>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-border bg-card ml-auto">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg",
                view === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <opt.icon className="size-4" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
            showFilters || hasActiveFilters
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <Badge variant="primary" size="sm" className="ml-1">
              {Object.values(filters).filter(Boolean).length}
            </Badge>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border bg-card animate-fade-in">
          {/* Mechanic filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Mechanic</label>
            <select
              value={filters.mechanicId || ""}
              onChange={(e) => setFilters((p) => ({ ...p, mechanicId: e.target.value || null }))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
            >
              <option value="">All</option>
              {mechanics.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={filters.status || ""}
              onChange={(e) => setFilters((p) => ({ ...p, status: (e.target.value || null) as any }))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
            >
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-danger hover:text-danger/80 transition-colors"
            >
              <X className="size-3" />
              Clear filters
            </button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {appointments.filter((a) => a.date === currentDate).length} appointments today
          </span>
        </div>
      )}

      {/* Calendar Views */}
      {view === "day" && (
        <DayView
          date={currentDate}
          appointments={appointments}
          mechanics={mechanics}
          filters={filters}
          onAppointmentClick={handleAppointmentClick}
          onAppointmentDrop={handleAppointmentDrop}
          onSlotClick={handleSlotClick}
        />
      )}

      {view === "week" && (
        <WeekView
          weekStart={weekStart}
          appointments={appointments}
          mechanics={mechanics}
          filters={filters}
          onAppointmentClick={handleAppointmentClick}
        />
      )}

      {view === "month" && (
        <MonthView
          month={monthStr}
          appointments={appointments}
          onDateClick={(date) => {
            setCurrentDate(date);
            setView("day");
          }}
        />
      )}

      {/* Booking Modal */}
      <BookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        mechanics={mechanics}
        prefill={bookingPrefill}
        onSave={handleBookingSave}
        existingAppointments={appointments}
      />
    </div>
  );
}
