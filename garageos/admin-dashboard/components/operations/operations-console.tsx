"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { CaseDetail, CaseList, CaseMechanic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { CaseDetailPanel } from "./case-detail";
import { ConversationPane } from "./conversation-pane";
import { enumLabel, fmtTimer, operationControl, SEV_BAR, TYPE_ICON } from "./shared";
import { accessFailure, uncertainWrite, useOperationRead } from "./use-operation-read";
import { useStaffMessageSession } from "@/lib/use-staff-message-session";
import { MessageStorageError } from "@/lib/message-intents";

const PAGE_SIZE = 20;
type Selection = { id: string; independent: boolean; version: number };
type Outcome = "saved" | "failed" | "uncertain";

export function OperationsConsole({ canWrite: initialCanWrite }: { canWrite: boolean }) {
  const { t, fmt } = useI18n(), params = useSearchParams(), urlCase = params.get("case");
  const currentUrlCase = useRef(urlCase); currentUrlCase.current = urlCase;
  const session = useStaffMessageSession(), canWrite = initialCanWrite && session.canWrite;
  const [group, setGroup] = useState("active"), [type, setType] = useState("all");
  const [q, setQ] = useState(""), [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null), selected = useRef<Selection | null>(null), selectionVersion = useRef(0);
  const [view, setView] = useState<"list" | "detail" | "conversation">("list");
  const [denied, setDenied] = useState<401 | 403 | null>(null), deniedRef = useRef(false);
  const [pending, setPending] = useState(false), pendingGuard = useRef(false);
  const [writeTarget, setWriteTarget] = useState<string | null>(null), pendingTarget = useRef<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const freshIds = useRef(new Set<string>()), [freshRequired, setFreshRequired] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const focusCase = useRef<string | null>(null), detailHeading = useRef<HTMLHeadingElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const suspendedSelection = useRef<string | null>(null);
  const onDenied = useCallback((error: unknown) => {
    session.suspend(); suspendedSelection.current = selected.current?.id ?? suspendedSelection.current;
    deniedRef.current = true; selected.current = null; setSelection(null);
    setDenied(error instanceof ClientApiError && error.status === 401 ? 401 : 403);
  }, [session]);
  const select = useCallback((id: string | null, independent = false, focus = false) => {
    const version = ++selectionVersion.current;
    const value = id ? { id, independent, version } : null;
    selected.current = value; setSelection(value);
    focusCase.current = focus ? id : null;
    if (id) setView("detail");
  }, []);
  useEffect(() => { if (accessFailure(session.error)) onDenied(session.error); }, [session.error, onDenied]);
  const verifySession = async () => {
    const target = suspendedSelection.current ?? selected.current?.id ?? urlCase;
    const version = selectionVersion.current, route = currentUrlCase.current;
    const fresh = await session.verify();
    if (!fresh) return;
    deniedRef.current = false; setDenied(null);
    if (currentUrlCase.current !== route) select(currentUrlCase.current, true);
    else if (selectionVersion.current === version) select(target, true);
  };
  useEffect(() => { if (!deniedRef.current) select(urlCase, true); }, [urlCase, select]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { const timer = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(timer); }, [q]);

  const query = new URLSearchParams({ status: group, limit: String(PAGE_SIZE), offset: String(offset) });
  if (type !== "all") query.set("type", type);
  if (search) query.set("q", search);
  const principal = session.actor ? `${session.actor.center}:${session.actor.id}` : null;
  const listKey = principal ? `${principal}|${group}|${type}|${q}|${offset}` : null;
  const list = useOperationRead<CaseList>(listKey, `/cases?${query}`, !!principal && !denied && q.trim() === search, onDenied);
  const detailKey = selection && principal ? `${principal}:${selection.id}:${selection.version}` : null;
  const detail = useOperationRead<CaseDetail>(detailKey, selection ? `/cases/${encodeURIComponent(selection.id)}` : null, !!principal && !denied && (!pending || selection?.id !== writeTarget), onDenied);
  const roster = useOperationRead<CaseMechanic[]>(principal ? `${principal}:mechanics` : null, "/cases/mechanics", !!principal && !denied, onDenied, false);
  const clamp = useRef<string | null>(null), filterKey = `${group}|${type}|${search}`;
  useEffect(() => {
    if (!list.data || list.error) return;
    const invalidPage = `${filterKey}|${offset}|${list.data.total}`;
    if (offset > 0 && offset >= list.data.total && clamp.current !== invalidPage) {
      clamp.current = invalidPage; select(null); setOffset(Math.max(0, Math.ceil(list.data.total / PAGE_SIZE) - 1) * PAGE_SIZE); return;
    }
    if (selected.current && !selected.current.independent && !list.data.items.some(item => item.id === selected.current!.id)) select(null);
  }, [list.data, list.error, offset, filterKey, select]);
  useEffect(() => {
    if (detail.data && detail.data.id !== pendingTarget.current && freshIds.current.has(detail.data.id)) {
      freshIds.current.delete(detail.data.id);
      setFreshRequired(old => { const next = { ...old }; delete next[detail.data!.id]; return next; });
    }
    if (detail.data?.id === focusCase.current) { detailHeading.current?.focus(); focusCase.current = null; }
  }, [detail.data]);
  const browse = () => { select(null); setView("list"); clamp.current = null; };
  const back = () => { setView("list"); requestAnimationFrame(() => searchInput.current?.focus()); };
  const navigate = (next: "detail" | "conversation") => {
    setView(next);
    requestAnimationFrame(() => {
      if (next === "detail") detailHeading.current?.focus();
      else document.querySelector<HTMLElement>("[data-conversation-heading]")?.focus();
    });
  };
  const clearOutcome = (id: string) => setOutcomes(old => { const next = { ...old }; delete next[id]; return next; });
  const reconcile = async () => {
    const target = selected.current; if (!target || pendingGuard.current) return;
    const data = await detail.refresh();
    if (data?.id === target.id && selected.current?.version === target.version) clearOutcome(target.id);
  };
  const mutate = async (patch: Record<string, unknown>) => {
    const target = selected.current;
    if (!target || !canWrite || deniedRef.current || pendingGuard.current || freshIds.current.has(target.id) || !detail.data || detail.loading || detail.error || outcomes[target.id] === "uncertain") return;
    freshIds.current.add(target.id); setFreshRequired(old => ({ ...old, [target.id]: true }));
    pendingGuard.current = true; pendingTarget.current = target.id; setPending(true); setWriteTarget(target.id); detail.invalidate(); list.invalidate(); clearOutcome(target.id);
    try {
      // The PATCH contract is a partial summary. Only a new full GET can replace
      // CaseDetail; the acknowledgement remains success if that later read fails.
      await clientFetch(`/cases/${target.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!deniedRef.current) setOutcomes(old => ({ ...old, [target.id]: "saved" }));
    } catch (error) {
      if (accessFailure(error)) onDenied(error);
      else setOutcomes(old => ({ ...old, [target.id]: uncertainWrite(error) ? "uncertain" : "failed" }));
    } finally {
      pendingGuard.current = false; pendingTarget.current = null; setPending(false); setWriteTarget(null);
      // Enabling detail starts a fresh GET for the CURRENT identity. The captured
      // old write never supplies data for another selected case.
      if (!deniedRef.current) void list.refresh();
    }
  };
  const data = denied ? null : list.data, caseDetail = denied ? null : detail.data;
  const outcome = selection ? outcomes[selection.id] : undefined;
  if (denied) return <div role="alert" className="p-5 space-y-3"><p>{t(session.error instanceof MessageStorageError ? "message.storage" : denied === 401 ? "ops.auth" : "ops.denied")}</p>{denied === 401 && <Link className={cn(operationControl, "inline-flex items-center")} href="/login?reauth=1">{t("ops.login")}</Link>}<button className={operationControl} onClick={() => void verifySession()}>{t("message.verify")}</button></div>;
  if (session.error) return <div role="alert" className="p-5 space-y-3"><p>{t(session.error instanceof MessageStorageError ? "message.storage" : "message.verify_error")}</p><button className={operationControl} onClick={() => void verifySession()}>{t("message.verify")}</button></div>;

  return <div data-operations className="grid h-full min-h-0 min-w-0 xl:grid-cols-[288px_minmax(0,1fr)_320px]">
    <aside aria-label={t("ops.title")} className={cn("min-h-0 min-w-0 flex-col border-r border-border bg-card", view === "list" ? "flex" : "hidden xl:flex")}>
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-bold">{t("ops.title")}</h1><button className={operationControl} onClick={() => void list.refresh()} disabled={list.loading}>{t("ops.refresh")}</button></div>
        {data && <p className="text-sm text-foreground" aria-live="polite">{t("ops.counts", { total: fmt.number(data.total), active: fmt.number(data.active_count) })}</p>}
        {!!list.error && <div role="alert" className="space-y-2 text-sm"><p>{t(data ? "ops.stale" : list.error instanceof ClientApiError && list.error.code === "CASE_SEARCH_UNAVAILABLE" ? "ops.search_unavailable" : "ops.read_error")}</p><button className={operationControl} onClick={() => void list.refresh()}>{t("ops.retry")}</button></div>}
        <div className="flex gap-2">{["active", "resolved"].map(value => <button key={value} className={cn(operationControl, "flex-1", group === value && "bg-primary/10 font-bold text-foreground")} aria-pressed={group === value} onClick={() => { browse(); setGroup(value); setOffset(0); }}>{t(`ops.${value}`)}</button>)}</div>
        <label className="block text-sm"><span>{t("ops.search")}</span><input ref={searchInput} aria-label={t("ops.search")} maxLength={200} value={q} onChange={e => { browse(); setQ(e.target.value); setOffset(0); }} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
        <label className="block text-sm"><span>{t("ops.all")}</span><select aria-label={t("ops.all")} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-2" value={type} onChange={e => { browse(); setType(e.target.value); setOffset(0); }}><option value="all">{t("ops.all")}</option>{Object.keys(TYPE_ICON).map(value => <option key={value} value={value}>{enumLabel(t, "type", value)}</option>)}</select></label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2" aria-busy={list.loading}>
        {(!data || q.trim() !== search) && list.loading && !list.error && <p role="status" className="p-3">{t("ops.loading")}</p>}
        {data?.items.length === 0 && <p className="p-3 text-sm text-foreground">{t("ops.empty")}</p>}
        {data?.items.map(item => <button key={item.id} aria-pressed={selection?.id === item.id} onClick={() => select(item.id, false, true)} className={cn("w-full min-w-0 rounded-xl border border-l-4 p-3 text-left focus-visible:outline-2 focus-visible:outline-primary", SEV_BAR[item.severity] ?? "border-l-slate-500", selection?.id === item.id ? "bg-primary/10" : "bg-background hover:bg-muted")}>
          <div className="flex flex-wrap justify-between gap-2 text-xs"><span>{enumLabel(t, "severity", item.severity)}</span><span>{enumLabel(t, "status", item.status)}</span></div>
          <p className="mt-1 break-words font-medium [overflow-wrap:anywhere]" title={item.title}>{item.title}</p>
          <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]">{item.customer_name ?? t("ops.not_recorded")}</p>
          {item.vehicle_label && <p className="break-words text-xs text-foreground [overflow-wrap:anywhere]">{item.vehicle_label}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="font-mono">{item.code}</span><span>{enumLabel(t, "type", item.case_type)}</span>{item.assigned_user_id && <span>{t("ops.assigned")}</span>}</div>
          {item.is_open && <p className="mt-2 text-xs">{t("ops.sla")}: {fmtTimer((now - new Date(item.created_at).getTime()) / 1000, t, fmt.number)}</p>}
          {item.sla_breached && <p className="mt-1 text-xs font-medium text-destructive">{t("ops.breached")}</p>}
        </button>)}
      </div>
      {data && <div className="border-t border-border p-3 space-y-2"><p className="text-sm">{t("ops.results", { start: fmt.number(data.total ? data.offset + 1 : 0), end: fmt.number(Math.min(data.offset + data.items.length, data.total)), total: fmt.number(data.total) })}</p><div className="flex gap-2"><button className={cn(operationControl, "flex-1")} disabled={list.loading || offset === 0} onClick={() => { browse(); setOffset(Math.max(0, offset - PAGE_SIZE)); }}>{t("ops.previous")}</button><button className={cn(operationControl, "flex-1")} disabled={list.loading || offset + PAGE_SIZE >= data.total} onClick={() => { browse(); setOffset(offset + PAGE_SIZE); }}>{t("ops.next")}</button></div></div>}
    </aside>
    <section aria-label={t("ops.detail")} className={cn("min-h-0 min-w-0 overflow-y-auto bg-muted/30", view === "detail" ? "block" : "hidden xl:block")}>
      <div className="flex flex-wrap gap-2 border-b border-border p-3 xl:hidden"><button className={operationControl} onClick={back}>{t("ops.back")}</button><button className={operationControl} disabled={!caseDetail} onClick={() => navigate("conversation")}>{t("ops.conversation")}</button></div>
      {selection?.independent && caseDetail && !data?.items.some(item => item.id === selection.id) && <p className="p-3 text-sm">{t("ops.outside")}</p>}
      {!canWrite && <p className="p-3 text-sm">{t("ops.readonly")}</p>}
      {outcome && <div role={outcome === "saved" ? "status" : "alert"} className="p-3 space-y-2 text-sm"><p>{t(outcome === "saved" ? "ops.saved" : outcome === "uncertain" ? "ops.save_uncertain" : "ops.save_failed")}</p>{outcome !== "saved" && <button className={operationControl} disabled={pending || detail.loading} onClick={() => void reconcile()}>{t("ops.reconcile")}</button>}</div>}
      {!!detail.error && <div role="alert" className="p-3 space-y-2 text-sm"><p>{t(caseDetail ? "ops.stale" : detail.error instanceof ClientApiError && [404, 422].includes(detail.error.status) ? "ops.missing" : "ops.read_error")}</p><button className={operationControl} onClick={() => void detail.refresh()}>{t("ops.retry")}</button></div>}
      {caseDetail ? <CaseDetailPanel detail={caseDetail} headingRef={detailHeading} mechanics={roster.data} mechanicsError={!!roster.error} retryMechanics={() => void roster.refresh()} now={now} canWrite={canWrite && !pending && !detail.loading && !detail.error && !freshRequired[caseDetail.id] && outcome !== "uncertain" && outcome !== "failed"} pending={pending && writeTarget === caseDetail.id} onAssign={id => void mutate({ assigned_user_id: id })} onStatus={status => void mutate({ status })} refresh={() => void detail.refresh()} /> : <p role="status" className="p-5 text-sm text-foreground">{t(selection ? detail.error ? "ops.missing" : "ops.loading" : "ops.select")}</p>}
    </section>
    <div className={cn("min-h-0 min-w-0 flex-col border-l border-border bg-card", view === "conversation" ? "flex" : "hidden xl:flex")}>
      <div className="flex flex-wrap gap-2 border-b border-border p-3 xl:hidden"><button className={operationControl} onClick={back}>{t("ops.back")}</button><button className={operationControl} onClick={() => navigate("detail")}>{t("ops.detail")}</button></div>
      <ConversationPane detail={caseDetail} identity={detailKey} actor={session.actor} isAuthorized={session.isAuthorized} canWrite={canWrite && !detail.error} onDenied={onDenied} now={now} />
    </div>
  </div>;
}
