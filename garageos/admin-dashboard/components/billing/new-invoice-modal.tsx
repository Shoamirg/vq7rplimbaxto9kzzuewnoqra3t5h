"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, Receipt, Search, Trash2, X } from "lucide-react";
import { Button, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { Customer360, CustomerList, CustomerListItem, InvoiceDoc } from "@/lib/api/types";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const LABEL = "block text-xs font-semibold text-muted-foreground mb-1.5";
const LINE_KINDS = [["part", "Part"], ["labor", "Labor"], ["fee", "Fee"], ["discount", "Discount"]] as const;

type Vehicle = { id: string; label: string };
type Line = { kind: string; description: string; quantity: number; unit_price: number };

const emptyLine = (): Line => ({ kind: "part", description: "", quantity: 1, unit_price: 0 });

export function NewInvoiceModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: "estimate" | "invoice";
  onClose: () => void;
  onCreated?: (doc: InvoiceDoc) => void;
}) {
  const { toast } = useToast();
  const isEstimate = kind === "estimate";

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clientFetch<CustomerList>("/customers?limit=200").then((r) => setCustomers(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customer) { setVehicles([]); setVehicleId(""); return; }
    clientFetch<Customer360>(`/customers/${customer.id}`)
      .then((c) => setVehicles(c.vehicles.map((v) => ({ id: v.id, label: v.label }))))
      .catch(() => setVehicles([]));
  }, [customer]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) => c.full_name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)).slice(0, 8);
  }, [query, customers]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (l.kind === "discount" ? -1 : 1), 0),
    [lines],
  );

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const validLines = lines.filter((l) => l.description.trim());
  const canSave = Boolean(customer) && validLines.length > 0 && !saving;

  async function save() {
    if (!customer) return;
    setSaving(true);
    try {
      const doc = await clientFetch<InvoiceDoc>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          kind,
          customer_id: customer.id,
          vehicle_id: vehicleId || null,
          notes: notes.trim() || null,
          line_items: validLines.map((l) => ({
            kind: l.kind, description: l.description.trim(),
            quantity: Number(l.quantity) || 1, unit_price: Number(l.unit_price) || 0,
          })),
        }),
      });
      toast({ title: isEstimate ? "Estimate created" : "Invoice created", description: customer.full_name, variant: "success" });
      onCreated?.(doc);
      onClose();
    } catch (err) {
      if (!(err instanceof ClientApiError && err.status === 403)) {
        toast({ title: `Could not create ${kind}`, description: "Please check the details and try again.", variant: "danger" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`New ${kind}`}
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Receipt className={`size-4 ${isEstimate ? "text-blue-600" : "text-emerald-600"}`} /> New {kind}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer */}
          <div>
            <label className={LABEL} htmlFor="inv-customer">Customer</label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">{customer.full_name}</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setCustomer(null); setQuery(""); }}>Change</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input id="inv-customer" className={`${FIELD} pl-9`} placeholder="Search customers…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
                </div>
                {matches.length > 0 && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {matches.map((c) => (
                      <button key={c.id} onClick={() => setCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors">
                        <span className="font-medium">{c.full_name}</span>{c.phone ? <span className="text-muted-foreground"> · {c.phone}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Vehicle */}
          <div>
            <label className={LABEL} htmlFor="inv-vehicle">Vehicle <span className="font-normal text-muted-foreground">(optional)</span></label>
            <select id="inv-vehicle" className={FIELD} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customer}>
              <option value="">No specific vehicle</option>
              {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
            </select>
          </div>

          {/* Line items */}
          <div>
            <label className={LABEL}>Line items</label>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-start gap-2">
                  <select className={`${FIELD} w-24 shrink-0`} value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value })} aria-label="Line type">
                    {LINE_KINDS.map(([v, label]) => (<option key={v} value={v}>{label}</option>))}
                  </select>
                  <input className={FIELD} placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <input className={`${FIELD} w-14 shrink-0 text-center`} type="number" min={0} step="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} aria-label="Quantity" />
                  <input className={`${FIELD} w-24 shrink-0 text-right`} type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} aria-label="Unit price" />
                  <button className="p-2 mt-0.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Remove line"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines((ls) => [...ls, emptyLine()])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Plus className="size-4" /> Add line
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL} htmlFor="inv-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="inv-notes" className={`${FIELD} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border">
          <div className="text-sm"><span className="text-muted-foreground">Subtotal</span> <span className="font-bold tabular-nums">${total.toFixed(2)}</span></div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!canSave} onClick={save} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}>
              {saving ? "Creating…" : `Create ${kind}`}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
