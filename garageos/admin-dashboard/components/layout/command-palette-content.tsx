"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  CommandGroup,
  CommandItem,
} from "@garageos/design-system";
import {
  LayoutDashboard,
  Calendar,
  Car,
  Users,
  Wrench,
  Settings,
  BarChart3,
  Warehouse,
} from "lucide-react";

export function CommandPaletteContent() {
  const router = useRouter();

  const navigate = (href: string) => router.push(href);

  return (
    <CommandPalette>
      <CommandGroup label="Pages" icon={<LayoutDashboard className="size-3.5" />}>
        <CommandItem icon={<LayoutDashboard className="size-4" />} value="Dashboard" onSelect={() => navigate("/dashboard")}>
          Dashboard
        </CommandItem>
        <CommandItem icon={<Calendar className="size-4" />} value="Calendar" onSelect={() => navigate("/calendar")}>
          Calendar
        </CommandItem>
        <CommandItem icon={<Car className="size-4" />} value="Vehicles" onSelect={() => navigate("/vehicles")}>
          Vehicles
        </CommandItem>
        <CommandItem icon={<Users className="size-4" />} value="Customers" onSelect={() => navigate("/customers")}>
          Customers
        </CommandItem>
        <CommandItem icon={<Wrench className="size-4" />} value="Appointments" onSelect={() => navigate("/appointments")}>
          Appointments
        </CommandItem>
        <CommandItem icon={<Warehouse className="size-4" />} value="Inventory" onSelect={() => navigate("/inventory")}>
          Inventory
        </CommandItem>
        <CommandItem icon={<BarChart3 className="size-4" />} value="Reports" onSelect={() => navigate("/reports")}>
          Reports
        </CommandItem>
        <CommandItem icon={<Settings className="size-4" />} value="Settings" onSelect={() => navigate("/settings")}>
          Settings
        </CommandItem>
      </CommandGroup>
      <CommandGroup label="Actions" icon={<Wrench className="size-3.5" />}>
        <CommandItem icon={<Calendar className="size-4" />} value="New Appointment" onSelect={() => {}}>
          New Appointment
        </CommandItem>
        <CommandItem icon={<Car className="size-4" />} value="Add Vehicle" onSelect={() => {}}>
          Add Vehicle
        </CommandItem>
        <CommandItem icon={<Users className="size-4" />} value="Add Customer" onSelect={() => {}}>
          Add Customer
        </CommandItem>
      </CommandGroup>
    </CommandPalette>
  );
}
