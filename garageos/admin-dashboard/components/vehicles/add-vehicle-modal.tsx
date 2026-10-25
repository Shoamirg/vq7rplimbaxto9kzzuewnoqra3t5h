"use client";

import { NewVehicleModal } from "@/components/intake/intake-modals";

export function AddVehicleModal({ customerId, onClose, onAdded }: {
  customerId: string; onClose: () => void; onAdded: () => void;
}) {
  return <NewVehicleModal presetCustomer={{ id: customerId, full_name: "" }} onClose={onClose} onCreated={onAdded} />;
}
