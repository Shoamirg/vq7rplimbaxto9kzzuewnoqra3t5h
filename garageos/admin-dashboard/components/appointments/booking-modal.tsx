"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "@garageos/design-system";
import type { Mechanic, Appointment, BookingFormData } from "./types";
import { serviceDurations } from "./mock-data";

const CUSTOMER_VEHICLES: Record<string, { vehicle: string; plate: string }[]> = {
  "Robert Chen": [{ vehicle: "Tesla Model 3", plate: "TES-1234" }],
  "Sarah Williams": [{ vehicle: "Ford F-150", plate: "FRD-5678" }],
  "Mike Johnson": [{ vehicle: "Honda Civic", plate: "HND-9012" }],
  "Emily Davis": [{ vehicle: "BMW X5", plate: "BMW-3456" }],
  "David Thompson": [{ vehicle: "Toyota RAV4", plate: "TYT-7890" }],
  "Lisa Martinez": [{ vehicle: "Chevrolet Tahoe", plate: "CHV-2345" }],
  "James Wilson": [{ vehicle: "Mercedes C300", plate: "MRC-6789" }, { vehicle: "Porsche 911", plate: "PRS-1234" }],
  "Amanda Brown": [{ vehicle: "Nissan Altima", plate: "NSS-0123" }],
};

const CUSTOMERS = Object.keys(CUSTOMER_VEHICLES);
const SERVICES = Object.keys(serviceDurations);

interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mechanics: Mechanic[];
  prefill?: {
    mechanicId?: string;
    startTime?: string;
    date?: string;
  };
  onSave: (data: BookingFormData) => void;
  existingAppointments?: Appointment[];
}

export function BookingModal({
  open,
  onOpenChange,
  mechanics,
  prefill,
  onSave,
  existingAppointments = [],
}: BookingModalProps) {
  const [formData, setFormData] = useState<BookingFormData>(() => ({
    customerName: "",
    vehicleName: "",
    licensePlate: "",
    service: SERVICES[0],
    mechanicId: prefill?.mechanicId || mechanics[0]?.id || "",
    date: prefill?.date || new Date().toISOString().split("T")[0],
    startTime: prefill?.startTime || "09:00",
    durationMinutes: serviceDurations[SERVICES[0]] || 30,
    notes: "",
  }));

  const [errors, setErrors] = useState<Partial<Record<keyof BookingFormData, string>>>({});

  // Filter vehicles based on selected customer
  const vehicles = useMemo(() => {
    if (!formData.customerName) return [];
    return CUSTOMER_VEHICLES[formData.customerName] || [];
  }, [formData.customerName]);

  // Handle customer change
  const handleCustomerChange = useCallback((name: string) => {
    setFormData((prev) => {
      const customerVehicles = CUSTOMER_VEHICLES[name] || [];
      return {
        ...prev,
        customerName: name,
        vehicleName: customerVehicles[0]?.vehicle || "",
        licensePlate: customerVehicles[0]?.plate || "",
      };
    });
    setErrors((prev) => ({ ...prev, customerName: undefined }));
  }, []);

  // Handle service change
  const handleServiceChange = useCallback((service: string) => {
    setFormData((prev) => ({
      ...prev,
      service,
      durationMinutes: serviceDurations[service] || 30,
    }));
  }, []);

  // Vehicle selection updates plate
  const handleVehicleChange = useCallback(
    (vehicle: string) => {
      const found = vehicles.find((v) => v.vehicle === vehicle);
      setFormData((prev) => ({
        ...prev,
        vehicleName: vehicle,
        licensePlate: found?.plate || "",
      }));
    },
    [vehicles]
  );

  // Validate
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof BookingFormData, string>> = {};
    if (!formData.customerName) newErrors.customerName = "Customer is required";
    if (!formData.vehicleName) newErrors.vehicleName = "Vehicle is required";
    if (!formData.service) newErrors.service = "Service is required";
    if (!formData.mechanicId) newErrors.mechanicId = "Mechanic is required";
    if (!formData.startTime) newErrors.startTime = "Time is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      onSave(formData);
      onOpenChange(false);
    },
    [formData, validate, onSave, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
          <DialogDescription>
            Schedule a new service appointment
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Customer</label>
              <select
                value={formData.customerName}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">Select customer...</option>
                {CUSTOMERS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.customerName && (
                <p className="text-[10px] text-danger">{errors.customerName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Vehicle</label>
              <select
                value={formData.vehicleName}
                onChange={(e) => handleVehicleChange(e.target.value)}
                disabled={!formData.customerName}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
              >
                <option value="">Select vehicle...</option>
                {vehicles.map((v) => (
                  <option key={v.vehicle} value={v.vehicle}>
                    {v.vehicle} ({v.plate})
                  </option>
                ))}
              </select>
              {errors.vehicleName && (
                <p className="text-[10px] text-danger">{errors.vehicleName}</p>
              )}
            </div>
          </div>

          {/* Service + Mechanic */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Service</label>
              <select
                value={formData.service}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                {SERVICES.map((s) => (
                  <option key={s} value={s}>{s} ({serviceDurations[s]}min)</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Mechanic</label>
              <select
                value={formData.mechanicId}
                onChange={(e) => setFormData((p) => ({ ...p, mechanicId: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                {mechanics.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.specialization}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time + Duration */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Time</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              {errors.startTime && (
                <p className="text-[10px] text-danger">{errors.startTime}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Duration</label>
              <p className="h-10 flex items-center text-sm text-foreground">
                {formData.durationMinutes} minutes
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Customer notes, special instructions..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 resize-none placeholder:text-muted-foreground/50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Book Appointment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
