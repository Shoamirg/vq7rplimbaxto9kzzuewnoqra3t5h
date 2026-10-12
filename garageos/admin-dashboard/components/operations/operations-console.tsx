"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Radio } from "lucide-react";
import { cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { CaseDetail, CaseList, CaseListItem, CaseMechanic, CaseSeverity, CaseType } from "@/lib/api/types";
import { CaseDetailPanel } from "./case-detail";
import { ConversationPane } from "./conversation-pane";
import { SEV_BAR, SEV_TEXT, TYPE_ICON, fmtTimer } from "./shared";

const TYPES: { key: string; label: string }[] = [
  { key: "all", label: "All" }, { key: "emergency", label: "Emergency" }, { key: "support", label: "Support" },
  { key: "towing", label: "Towing" }, { key: "warranty", label: "Warranty" }, { key: "vip", label: "VIP" },
];

export function OperationsConsole() {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [mechanics, setMechanics] = useState<CaseMechanic[]>([]);
  const [group, setGroup] = useState<"active" | "resolved">("active");
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string>>(new Set());
  const searchParams = useSearchParams();

  // SLA timers tick every second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Deep-link from the Inbox ("Open Operational Case") preselects the case.
  useEffect(() => {
    const c = searchParams.get("case");
    if (c) setActiveId(c);
  }, [searchParams]);

  const loadCases = useCallback(async () => {
    try {
      const data = await clientFetch<CaseList>(`/cases?status=${group}${type !== "all" ? `&type=${type}` : ""}`);
      setCases(data.items);
      setActiveCount(data.active_count);
      setActiveId((cur) => cur ?? data.items[0]?.id ?? null);
    } catch { /* keep */ }
  }, [group, type]);

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await clientFetch<CaseDetail>(`/cases/${id}`)); } catch { /* keep */ }
  }, []);

  useEffect(() => { clientFetch<CaseMechanic[]>("/cases/mechanics").then(setMechanics).catch(() => {}); }, []);
  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { const t = setInterval(loadCases, 8000); return () => clearInterval(t); }, [loadCases]);
  useEffect(() => { if (activeId) loadDetail(activeId); }, [activeId, loadDetail]);
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => loadDetail(activeId), 8000);
    return () => clearInterval(t);
  }, [activeId, loadDetail]);

  const mutate = useCallback(async (patch: Record<string, unknown>) => {
    if (!activeId) return;
    try {
      const updated = await clientFetch<CaseDetail>(`/cases/${activeId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setDetail(updated);
      loadCases();
    } catch { /* keep */ }
  }, [activeId, loadCases]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cases;
    return cases.filter((c) =>
      c.title.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) ||
      (c.customer_name ?? "").toLowerCase().includes(s));
  }, [q, cases]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left rail */}
      <aside className="w-[320px] shrink-0 bg-slate-900 text-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <span className="grid size-8 place-items-center rounded-lg bg-red-600 text-white text-sm">🛰️</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Operations</p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1"><Radio className="size-3 text-red-400" /> {activeCount} active</p>
            </div>
          </div>
          {/* group toggle */}
          <div className="flex rounded-lg bg-slate-800 p-0.5 mb-2">
            {(["active", "resolved"] as const).map((g) => (
              <button key={g} onClick={() => { setGroup(g); setActiveId(null); }}
                className={cn("flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                  group === g ? "bg-slate-700 text-white" : "text-slate-400")}>{g}</button>
            ))}
          </div>
          {/* search */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-2.5">
            <Search className="size-3.5 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases…"
              className="flex-1 bg-transparent py-2 text-xs text-white outline-hidden placeholder:text-slate-500" />
          </div>
          {/* type filters */}
          <div className="flex flex-wrap gap-1 mt-2">
            {TYPES.map((t) => (
              <button key={t.key} onClick={() => setType(t.key)}
                className={cn("px-2 py-0.5 rounded-full text-[11px] transition-colors",
                  type === t.key ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-500">No cases.</p>}
          {filtered.map((c) => {
            const isNew = !seen.current.has(c.id);
            seen.current.add(c.id);
            const elapsed = Math.max(0, Math.floor((now - new Date(c.created_at).getTime()) / 1000));
            const pct = Math.min(100, (elapsed / (c.sla_response_minutes * 60)) * 100);
            return (
              <button key={c.id} onClick={() => setActiveId(c.id)}
                className={cn("w-full text-left mx-2 my-1.5 p-3 rounded-xl border-l-4 transition-all",
                  isNew && "animate-fade-in",
                  activeId === c.id ? "bg-slate-800 ring-1 ring-slate-600" : "bg-slate-800/50 hover:bg-slate-800",
                  SEV_BAR[c.severity])} style={{ width: "calc(100% - 16px)" }}>
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px] font-extrabold tracking-wide", SEV_TEXT[c.severity])}>
                    {c.severity.toUpperCase()}
                  </span>
                  <span className="font-mono text-[13px] font-bold text-white">
                    {c.is_open ? fmtTimer(elapsed) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="grid size-7 place-items-center rounded-md bg-slate-900 text-sm">{TYPE_ICON[c.case_type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white truncate">{c.customer_name ?? "—"}</p>
                    <p className="text-[11px] text-slate-400 truncate">{c.vehicle_label ?? c.title}</p>
                  </div>
                  <span className="text-[9px] uppercase tracking-wide text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">{c.case_type}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-mono text-[10px] text-slate-500">{c.code}</span>
                  {c.assigned_user_id && <span className="text-[10px] text-emerald-400">● assigned</span>}
                  {c.sla_breached && <span className="text-[10px] text-red-400 font-semibold ml-auto">SLA breached</span>}
                </div>
                {c.is_open && (
                  <div className="h-1 rounded-full bg-slate-700 overflow-hidden mt-2">
                    <div className={cn("h-full rounded-full", pct > 85 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${pct}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Center */}
      <main className="flex-1 overflow-y-auto bg-muted/30">
        {detail
          ? <CaseDetailPanel detail={detail} mechanics={mechanics} now={now} onAssign={(id) => mutate({ assigned_user_id: id })} onStatus={(s) => mutate({ status: s })} />
          : <div className="grid h-full place-items-center text-sm text-muted-foreground">Select a case to view details.</div>}
      </main>

      {/* Right conversation */}
      <ConversationPane detail={detail} />
    </div>
  );
}
