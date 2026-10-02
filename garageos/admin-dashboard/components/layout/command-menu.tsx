"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Car, Users, Wrench, Calendar, LayoutDashboard, QrCode, Plus,
  CornerDownLeft, ArrowUp, ArrowDown, Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { SearchResults } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { NewCustomerModal, NewVehicleModal } from "@/components/intake/intake-modals";
import { NewAppointmentModal } from "@/components/appointments/new-appointment-modal";

// Custom event so the top-bar search box can open the menu too.
export const OPEN_EVENT = "garageos:command-open";

type Entry = {
  id: string;
  group: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  run: () => void;
};

const EMPTY: SearchResults = { query: "", customers: [], vehicles: [], mechanics: [] };

export function CommandMenu() {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [create, setCreate] = useState<"customer" | "vehicle" | "appointment" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K toggles; top-bar search dispatches OPEN_EVENT.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setActive(0);
    }
  }, [open]);

  // Debounced live search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults(EMPTY); setLoading(false); setError(false); return; }
    let active = true;
    const controller = new AbortController();
    setError(false);
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await clientFetch<SearchResults>(`/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (active) setResults(data);
      } catch {
        if (active) { setResults(EMPTY); setError(true); }
      } finally {
        if (active) setLoading(false);
      }
    }, 160);
    return () => { active = false; clearTimeout(t); controller.abort(); };
  }, [query, retry]);

  const go = useCallback((href: string, newTab = false) => {
    setOpen(false);
    if (newTab) window.open(href, "_blank");
    else router.push(href);
  }, [router]);

  // Quick actions (filtered by query substring on title).
  const actions: Entry[] = useMemo(() => {
    const all: Entry[] = [
      { id: "a-appt", group: t("command.actions"), icon: <Plus className="size-4" />, title: t("appointment.new"), run: () => { setOpen(false); setCreate("appointment"); } },
      { id: "a-cust", group: t("command.actions"), icon: <Users className="size-4" />, title: t("intake.new_customer"), run: () => { setOpen(false); setCreate("customer"); } },
      { id: "a-veh", group: t("command.actions"), icon: <Car className="size-4" />, title: t("intake.new_vehicle"), run: () => { setOpen(false); setCreate("vehicle"); } },
      { id: "a-cal", group: t("command.actions"), icon: <Calendar className="size-4" />, title: t("command.open_calendar"), run: () => go("/calendar") },
      { id: "a-dash", group: t("command.actions"), icon: <LayoutDashboard className="size-4" />, title: t("command.open_dashboard"), run: () => go("/dashboard") },
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((a) => a.title.toLowerCase().includes(q)) : all;
  }, [query, go, t]);

  // Live result entries.
  const resultEntries: Entry[] = useMemo(() => {
    const v: Entry[] = results.vehicles.map((x) => ({
      id: `v-${x.id}`, group: t("crm.vehicles"),
      icon: <Car className="size-4" />, title: x.label,
      subtitle: [x.license_plate, x.year].filter(Boolean).join(" · "),
      run: () => go(`/vehicles/${x.id}`),
    }));
    const p: Entry[] = results.vehicles.map((x) => ({
      id: `p-${x.id}`, group: t("command.passports"),
      icon: <QrCode className="size-4" />, title: `${x.label} — ${t("command.passports")}`,
      subtitle: x.license_plate ?? undefined,
      run: () => go(`/passport/${x.id}`, true),
    }));
    const c: Entry[] = results.customers.map((x) => ({
      id: `c-${x.id}`, group: t("crm.customers"),
      icon: <Users className="size-4" />, title: x.name,
      subtitle: x.phone ?? x.email ?? undefined,
      run: () => go(`/customers/${x.id}`),
    }));
    const m: Entry[] = results.mechanics.map((x) => ({
      id: `m-${x.id}`, group: t("command.mechanics"),
      icon: <Wrench className="size-4" />, title: x.name, subtitle: t("work.mechanic"),
      run: () => go("/calendar"),
    }));
    return [...v, ...c, ...p, ...m];
  }, [results, go, t]);

  const entries = useMemo(() => [...resultEntries, ...actions], [resultEntries, actions]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (active >= entries.length) setActive(Math.max(0, entries.length - 1));
  }, [entries.length, active]);

  // Scroll active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(entries.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); entries[active]?.run(); }
  };

  // Group entries in display order, tracking a flat index for nav/highlight.
  const groups: { label: string; items: { entry: Entry; idx: number }[] }[] = [];
  entries.forEach((entry, idx) => {
    let g = groups.find((x) => x.label === entry.group);
    if (!g) { g = { label: entry.group, items: [] }; groups.push(g); }
    g.items.push({ entry, idx });
  });

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="lg" className="p-0 gap-0 overflow-hidden top-[12%] translate-y-0" hideClose aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t("command.search")}</DialogTitle>
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("command.search")}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            aria-label={t("command.search")}
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto p-1.5" style={{ maxHeight: "56vh" }}>
          {error ? <p role="alert" className="p-3 text-sm text-red-600">{t("intake.load_failed")} <button className="underline" onClick={() => setRetry((n) => n + 1)}>{t("intake.retry")}</button></p> : null}
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
              {g.items.map(({ entry, idx }) => (
                <button
                  key={entry.id}
                  data-idx={idx}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => entry.run()}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    idx === active ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <span className="grid size-8 place-items-center rounded-md bg-background border border-border text-muted-foreground shrink-0">
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground truncate">{entry.title}</span>
                    {entry.subtitle && <span className="block text-xs text-muted-foreground truncate">{entry.subtitle}</span>}
                  </span>
                  {idx === active && <CornerDownLeft className="size-3.5 text-muted-foreground shrink-0" />}
                </button>
              ))}
            </div>
          ))}

          {query.trim() && !loading && !error && entries.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("command.no_results", { query: query.trim() })}
            </div>
          )}
          {!query.trim() && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              {t("command.search_hint")}
            </p>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><ArrowUp className="size-3" /><ArrowDown className="size-3" /> {t("command.navigate")}</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> {t("command.open")}</span>
          <span className="ml-auto flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1">Esc</kbd> {t("command.close")}</span>
        </div>
      </DialogContent>
    </Dialog>
    {create === "customer" ? <NewCustomerModal onClose={() => setCreate(null)} onCreated={(customer) => router.push(`/customers/${customer.id}`)} /> : null}
    {create === "vehicle" ? <NewVehicleModal onClose={() => setCreate(null)} onCreated={(vehicle) => router.push(`/vehicles/${vehicle.id}`)} /> : null}
    {create === "appointment" ? <NewAppointmentModal onClose={() => setCreate(null)} onCreated={() => router.refresh()} /> : null}
    </>
  );
}
