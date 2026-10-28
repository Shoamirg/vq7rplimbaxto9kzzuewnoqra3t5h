// Typed client for the platform control center (`/platform/tree`, networks,
// workshops, staff access, audit). All calls go through the BFF proxy.
import { clientFetch } from "@/lib/api/client";

export type WorkshopNode = {
  id: string; name: string; email: string | null; phone: string | null; address: string | null;
  timezone: string; network_id: string | null; is_active: boolean; staff_count: number; customer_count: number;
};
export type NetworkNode = {
  id: string; name: string; slug: string; is_exclusive: boolean; is_active: boolean; workshops: WorkshopNode[];
};
export type PlatformTree = { networks: NetworkNode[]; independent: WorkshopNode[] };
export type StaffMember = {
  id: string; full_name: string; email: string; role: string; is_active: boolean; is_super_admin: boolean;
};
export type AuditEntry = {
  id: string; created_at: string; action: string; status: string; service_center_id: string | null;
  garage: string | null; actor_email: string | null; resource_type: string | null; ip: string | null;
};
export type AuditPage = { items: AuditEntry[]; total: number; page: number; page_size: number };
export type Selection = { kind: "network"; id: string } | { kind: "workshop"; id: string } | null;

export const STAFF_ROLES = ["admin", "manager", "receptionist", "mechanic"] as const;

export type NetworkInput = { name: string; slug: string; is_exclusive: boolean };
export type WorkshopInput = {
  name: string; email?: string; phone?: string; address?: string; timezone: string; network_id: string | null;
  admin: { full_name: string; email: string; password: string };
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const controlApi = {
  tree: (signal?: AbortSignal) => clientFetch<PlatformTree>("/platform/tree", { signal }),
  createNetwork: (body: NetworkInput) => clientFetch<NetworkNode>("/platform/networks", json("POST", body)),
  updateNetwork: (id: string, body: Partial<Pick<NetworkNode, "name" | "is_exclusive" | "is_active">>) =>
    clientFetch<NetworkNode>(`/platform/networks/${id}`, json("PATCH", body)),
  createWorkshop: (body: WorkshopInput) => clientFetch<WorkshopNode>("/platform/workshops", json("POST", body)),
  updateWorkshop: (id: string, body: Partial<Pick<WorkshopNode, "name" | "network_id" | "is_active">>) =>
    clientFetch<WorkshopNode>(`/platform/workshops/${id}`, json("PATCH", body)),
  staff: (centerId: string, signal?: AbortSignal) =>
    clientFetch<StaffMember[]>(`/platform/workshops/${centerId}/staff`, { signal }),
  updateStaff: (userId: string, body: { role?: string; is_active?: boolean }) =>
    clientFetch<StaffMember>(`/platform/staff/${userId}`, json("PATCH", body)),
  audit: (params: URLSearchParams, signal?: AbortSignal) =>
    clientFetch<AuditPage>(`/platform/audit?${params}`, { signal }),
};

/** "Chevrolet Dealers UZ" → "chevrolet-dealers-uz" (matches the backend slug rule). */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function findWorkshop(tree: PlatformTree, id: string): WorkshopNode | undefined {
  return [...tree.independent, ...tree.networks.flatMap((n) => n.workshops)].find((w) => w.id === id);
}
