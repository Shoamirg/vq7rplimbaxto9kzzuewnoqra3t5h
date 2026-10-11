"use client";

import { forwardRef, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight, CalendarPlus, Camera, Check, Download, MapPin, Megaphone, Moon, PanelRightOpen, Phone, Pin, Receipt, Send, Share2, Siren,
} from "lucide-react";
import { Button, cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { ConvMessage, ConvStatus, ThreadDetail } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { useMessageComposer } from "@/lib/use-message-composer";
import { MessageSubmissionStatus } from "@/components/message-submission-status";
import { NewAppointmentModal } from "@/components/appointments/new-appointment-modal";
import { NewInvoiceModal } from "@/components/billing/new-invoice-modal";
import { NewInboxCaseModal } from "@/components/inbox/new-inbox-case-modal";
import { CHANNEL_META, CONV_TYPE_ICON, activityIcon, relTime, roleColor, safeCallHref } from "./shared";

type ComposerTab = "reply" | "note" | "announcement";

// Column 3 — the conversation. Activity interleaves the event stream with
// messages; Messages is human replies only. One composer, three modes.
export const ThreadView = forwardRef<HTMLTextAreaElement, {
  thread: ThreadDetail;
  mode: "activity" | "messages";
  onMode: (m: "activity" | "messages") => void;
  composerTab: ComposerTab;
  onComposerTab: (t: ComposerTab) => void;
  composer: ReturnType<typeof useMessageComposer<ConvMessage>>;
  canWrite: boolean;
  loading: boolean;
  readError: boolean;
  readAcknowledgement?: ReactNode;
  actionNotice?: ReactNode;
  actionBlocked: boolean;
  actorId: string;
  onAssign: (id: string | null) => void;
  onChooseAssignee: (opener: HTMLElement) => void;
  onSend: () => void;
  onStatus: (s: ConvStatus) => void;
  onToggleFollow: () => void;
  onPrepareRequest: (kind: "photos" | "location") => void;
  contextOpen: boolean;
  onOpenContext: () => void;
}>(function ThreadView(
  { thread, mode, onMode, composerTab, onComposerTab, composer, canWrite, loading, readError, readAcknowledgement, actionNotice, actionBlocked, actorId, onAssign, onChooseAssignee, onSend, onStatus, onToggleFollow, onPrepareRequest, contextOpen, onOpenContext },
  composerRef,
) {
  const { t } = useI18n();
  const [passportShareResult, setPassportShareResult] = useState<"copied" | "failed" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<"downloaded" | "failed" | null>(null);
  const exportingRef = useRef(false);
  const currentThreadId = useRef(thread.id); currentThreadId.current = thread.id;
  const [appointmentContext, setAppointmentContext] = useState<{ id: string; name: string; vehicleId?: string } | null>(null);
  const [estimateContext, setEstimateContext] = useState<{ customerId: string; customerName: string; vehicleId?: string } | null>(null);
  const [caseContext, setCaseContext] = useState<{ customerId: string; customerName: string; vehicleId?: string; vehicleLabel?: string } | null>(null);
  const blocked = !canWrite || loading || readError;
  const callHref = safeCallHref(thread.customer_phone);
  const passport = thread.linked.find((card) => card.kind === "passport" && card.link);
  const appointmentPreset = thread.customer_id && thread.customer_name ? {
    id: thread.customer_id, name: thread.customer_name, vehicleId: thread.vehicle_id ?? undefined,
  } : null;

  async function copyPassportLink() {
    setPassportShareResult(null);
    if (!passport?.link) return;
    try {
      await navigator.clipboard.writeText(new URL(passport.link, window.location.origin).href);
      setPassportShareResult("copied");
    } catch {
      setPassportShareResult("failed");
    }
  }

  async function exportThread() {
    const targetId = thread.id;
    if (exportingRef.current) return;
    exportingRef.current = true; setExporting(true); setExportResult(null);
    try {
      // Re-read through the normal current-auth, tenant-scoped and safe-child
      // boundary; never export the possibly stale page copy or its read token.
      const fresh = await clientFetch<ThreadDetail>(`/conversations/${targetId}`);
      if (currentThreadId.current !== targetId) return;
      const file = {
        format: "garageos.inbox-thread.v1",
        exported_at: new Date().toISOString(),
        scope: "one authorized conversation and its complete recorded message history",
        conversation: {
          id: fresh.id, subject: fresh.subject, conv_type: fresh.conv_type, status: fresh.status,
          priority: fresh.priority, last_channel: fresh.last_channel, created_at: fresh.created_at,
          last_message_at: fresh.last_message_at, last_activity_at: fresh.last_activity_at,
          last_message_preview: fresh.last_message_preview, last_sender_role: fresh.last_sender_role,
          customer_id: fresh.customer_id, customer_name: fresh.customer_name, customer_phone: fresh.customer_phone,
          vehicle_id: fresh.vehicle_id, vehicle_label: fresh.vehicle_label,
          appointment_id: fresh.appointment_id, case_id: fresh.case_id, invoice_id: fresh.invoice_id,
          assigned_user_id: fresh.assigned_user_id, assigned_name: fresh.assigned_name,
          case_code: fresh.case_code, case_status: fresh.case_status,
          stored_summary: fresh.ai_summary, pinned_notes: fresh.pinned_notes,
          linked: fresh.linked.map(({ kind, title, subtitle, link, available }) => ({ kind, title, subtitle, link, available })),
        },
        participants: fresh.participants.map(({ id, role, display_name, is_following, active_channel }) => ({
          id, role, display_name, is_following, active_channel,
        })),
        messages: fresh.messages.map(({ id, kind, channel, is_internal, author_role, author_name, body,
          delivery_status, mentions, created_at, attachments }) => ({
          id, kind, channel, is_internal, author_role, author_name, body, delivery_status, mentions, created_at,
          attachments: attachments.map(({ id: attachmentId, kind: attachmentKind, label }) => ({
            id: attachmentId, kind: attachmentKind, label,
          })),
        })),
        activity: fresh.activity.map(({ type, title, detail, date, severity, category, author_role, channel }) => ({
          type, title, detail, date, severity, category, author_role, channel,
        })),
        omitted: ["authentication/session data", "read-observation token", "attachment URLs and metadata", "live presence flags"],
      };
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `garageos-inbox-${targetId}.json`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportResult("downloaded");
    } catch {
      if (currentThreadId.current === targetId) setExportResult("failed");
    } finally {
      exportingRef.current = false; setExporting(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-muted/20 [overflow-wrap:anywhere]">
      {/* Header */}
      <div role="region" aria-label={t("message.overview")} tabIndex={0} className="max-h-[25%] lg:max-h-[45%] overflow-y-auto bg-card border-b border-border px-4 pt-3 shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
        {readAcknowledgement}
        {actionNotice}
        {!canWrite && <p className="pb-3 text-sm">{t("ops.readonly")}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-800 text-white text-sm font-bold">
            {(thread.customer_name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[15px] font-bold text-foreground">
              {thread.subject || thread.customer_name || t("inbox.conversation")}
            </h2>
            <p className="break-words text-xs text-muted-foreground">
              {[thread.customer_name, thread.vehicle_label, thread.case_code].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {thread.case_id && (
              <Link href={`/operations?case=${thread.case_id}`}
                className="min-h-11 min-w-11 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-1">
                <Siren className="size-3.5" /> {t("message.open_case")} <ArrowUpRight className="size-3" />
              </Link>
            )}
            <button onClick={onToggleFollow} disabled={actionBlocked}
              className={cn("min-h-11 min-w-11 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                thread.is_following ? "border-primary/40 bg-primary/5 text-primary dark:text-blue-300" : "border-border text-slate-600 dark:text-slate-300 hover:bg-muted")}>
              {t(thread.is_following ? "message.following" : "message.follow")}
            </button>
            <button onClick={() => onStatus("snoozed")} disabled={actionBlocked || thread.status === "snoozed"}
              className="min-h-11 min-w-11 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-amber-800 dark:text-amber-300 hover:bg-muted inline-flex items-center gap-1">
              <Moon className="size-3.5" /> {t("message.snooze")}
            </button>
            <button onClick={() => onStatus("resolved")} disabled={actionBlocked || thread.status === "resolved"}
              className="min-h-11 min-w-11 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 inline-flex items-center gap-1">
              <Check className="size-3.5" /> {t("message.close_thread")}
            </button>
            {!contextOpen && (
              <button onClick={onOpenContext} className="min-h-11 min-w-11 grid place-items-center p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted" aria-label={t("message.context")}>
                <PanelRightOpen className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 text-sm">{t("inbox.action.status")}
            <select className="mt-1 block min-h-11 max-w-full rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
              value={thread.status} disabled={actionBlocked} onChange={event => onStatus(event.target.value as ConvStatus)}>
              {(["open", "waiting_customer", "waiting_technician", "waiting_approval", "snoozed", "resolved"] as const).map(status =>
                <option key={status} value={status}>{t(`inbox.status.${status}`)}</option>)}
            </select>
          </label>
          <p className="min-w-0 break-words text-sm">{t("inbox.action.assigned")}: {thread.assigned_name ?? t("inbox.action.unassigned")}</p>
          <button className="min-h-11 min-w-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            disabled={actionBlocked} onClick={event => onChooseAssignee(event.currentTarget)}>{t("inbox.choice.assignee")}</button>
          <button className="min-h-11 min-w-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            disabled={actionBlocked || thread.assigned_user_id === actorId} onClick={() => onAssign(actorId)}>{t("inbox.action.assign_me")}</button>
          <button className="min-h-11 min-w-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            disabled={actionBlocked || !thread.assigned_user_id} onClick={() => onAssign(null)}>{t("inbox.action.clear_assignment")}</button>
        </div>

        {/* Linked pills */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border">
            {CONV_TYPE_ICON[thread.conv_type]} <span className="capitalize">{thread.conv_type}</span>
          </span>
          {thread.linked.map((c) => {
            const label = c.available === false ? t("inbox.linked.vehicle_unavailable") : c.title;
            return c.link ? (
              <Link key={c.kind} href={c.link} target={c.kind === "passport" ? "_blank" : undefined}
                className="min-h-11 min-w-11 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:text-primary transition-colors">
                {label}
              </Link>
            ) : (
              <span key={c.kind} role="note" aria-label={label ?? undefined}
                className="min-h-11 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground">
                {label}
              </span>
            );
          })}
        </div>

        {/* Activity | Messages */}
        <div className="flex flex-wrap items-center gap-0 mt-2.5">
          {(["activity", "messages"] as const).map((m) => (
            <button key={m} onClick={() => onMode(m)}
              className={cn("min-h-11 min-w-11 text-[13px] font-semibold px-3 py-2 border-b-2 -mb-px capitalize transition-colors",
                mode === m ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t(`message.${m}`)}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground pb-1.5">
            {t("message.activity_hint")}
          </span>
        </div>
      </div>

      {/* Pinned */}
      {thread.pinned_notes.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 flex-wrap shrink-0">
          <Pin className="size-3.5 text-amber-600" />
          {thread.pinned_notes.map((p, i) => (
            <span key={i} className="text-[11.5px] font-medium text-amber-900 bg-white border border-amber-200 rounded-md px-2 py-0.5">{p}</span>
          ))}
        </div>
      )}

      {/* Body */}
      <div role="region" aria-label={t("message.messages")} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3 focus-visible:outline-2 focus-visible:outline-primary">
        {mode === "messages"
          ? thread.messages.map((m) => <MessageBubble key={m.id} m={m} />)
          : thread.activity.map((a, i) => (
            a.type === "message"
              ? <MiniBubble key={i} role={a.author_role ?? "system"} name={a.title} body={a.detail} date={a.date} />
              : <EventLine key={i} icon={activityIcon(a)} title={a.title} detail={a.detail} date={a.date} />
          ))}
        {mode === "messages" && thread.messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">{t("message.empty")}</p>
        )}
      </div>

      {/* Quick actions */}
      <div role="region" aria-label={t("message.quick_actions")} tabIndex={0} className="flex gap-1.5 px-4 py-2 bg-card border-t border-border overflow-x-auto shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
        {callHref ? (
          <a href={callHref} className="min-h-11 min-w-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300 focus-visible:outline-2 focus-visible:outline-primary">
            <Phone className="size-3.5" aria-hidden="true" />{t("message.action.call")}
          </a>
        ) : (
          <span role="note" aria-label={t("message.action.phone_unavailable")} className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
            <Phone className="size-3.5" aria-hidden="true" />{t("message.action.phone_unavailable")}
          </span>
        )}
        <button type="button" disabled={blocked || actionBlocked} onClick={() => onPrepareRequest("photos")}
          className="min-h-11 min-w-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
          <Camera className="size-3.5" aria-hidden="true" />{t("message.action.request_photos")}
        </button>
        <button type="button" disabled={blocked || actionBlocked} onClick={() => onPrepareRequest("location")}
          className="min-h-11 min-w-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
          <MapPin className="size-3.5" aria-hidden="true" />{t("message.action.request_location")}
        </button>
        {passport ? (
          <Button variant="outline" size="sm" className="min-h-11 min-w-11"
            leftIcon={<Share2 className="size-3.5" aria-hidden="true" />}
            onClick={() => void copyPassportLink()}>
            {t("message.action.share_passport")}
          </Button>
        ) : (
          <span role="note" aria-label={t("message.action.passport_unavailable")}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
            🏅 {t("message.action.passport_unavailable")}
          </span>
        )}
        {passportShareResult === "copied" && <span role="status" className="sr-only">{t("message.action.passport_copied")}</span>}
        {passportShareResult === "failed" && <span role="alert" className="sr-only">{t("message.action.passport_copy_failed")}</span>}
        <Button variant="outline" size="sm" className="min-h-11 min-w-11"
          leftIcon={<Download className="size-3.5" aria-hidden="true" />}
          disabled={blocked || actionBlocked || exporting} onClick={() => void exportThread()}>
          {t(exporting ? "message.action.exporting" : "message.action.export_thread")}
        </Button>
        {exportResult === "downloaded" && <span role="status">{t("message.action.export_downloaded")}</span>}
        {exportResult === "failed" && <span role="alert">{t("message.action.export_failed")}</span>}
        {appointmentPreset ? (
          <Button variant="outline" size="sm" className="min-h-11 min-w-11"
            leftIcon={<CalendarPlus className="size-3.5" aria-hidden="true" />}
            disabled={blocked || actionBlocked} onClick={() => setAppointmentContext(appointmentPreset)}>
            {t("message.action.book_appointment")}
          </Button>
        ) : (
          <span role="note" aria-label={t("message.action.appointment_unavailable")}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
            📅 {t("message.action.appointment_unavailable")}
          </span>
        )}
        {appointmentPreset ? (
          <Button variant="outline" size="sm" className="min-h-11 min-w-11"
            leftIcon={<Siren className="size-3.5" aria-hidden="true" />}
            disabled={blocked || actionBlocked} onClick={() => setCaseContext({
              customerId: appointmentPreset.id, customerName: appointmentPreset.name,
              vehicleId: appointmentPreset.vehicleId, vehicleLabel: thread.vehicle_label ?? undefined,
            })}>
            {t("message.action.open_case")}
          </Button>
        ) : (
          <span role="note" aria-label={t("message.action.case_unavailable")}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
            🚨 {t("message.action.case_unavailable")}
          </span>
        )}
        {appointmentPreset ? (
          <Button variant="outline" size="sm" className="min-h-11 min-w-11"
            leftIcon={<Receipt className="size-3.5" aria-hidden="true" />}
            disabled={blocked || actionBlocked} onClick={() => setEstimateContext({
              customerId: appointmentPreset.id, customerName: appointmentPreset.name, vehicleId: appointmentPreset.vehicleId,
            })}>
            {t("message.action.create_estimate")}
          </Button>
        ) : (
          <span role="note" aria-label={t("message.action.estimate_unavailable")}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
            🧾 {t("message.action.estimate_unavailable")}
          </span>
        )}
        <span role="note" aria-label={t("message.action.eta_unavailable")}
          className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
          🚗 {t("message.action.eta_unavailable")}
        </span>
      </div>

      {appointmentContext && <NewAppointmentModal
        preset={appointmentContext} onClose={() => setAppointmentContext(null)} />}
      {estimateContext && <NewInvoiceModal
        kind="estimate" preset={estimateContext} onClose={() => setEstimateContext(null)} />}
      {caseContext && <NewInboxCaseModal preset={caseContext} onClose={() => setCaseContext(null)} />}

      {composer.saved && <p role="status" className="shrink-0 border-t border-border bg-card px-3 py-2 text-sm">{t("message.saved")}</p>}
      <div data-message-composer className="min-w-0 max-h-[65%] space-y-2 overflow-y-auto bg-card border-t border-border p-3">
        <MessageSubmissionStatus composer={composer} showSaved={false} />
        {!canWrite && <p className="text-sm">{t("ops.readonly")}</p>}
        <div className="flex flex-wrap gap-2">
          {(["reply", "note", "announcement"] as const).map(value => <button key={value} onClick={() => onComposerTab(value)} aria-pressed={composerTab === value}
            className={cn("min-h-11 min-w-11 rounded-lg border border-border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary", composerTab === value && "bg-primary/10 text-foreground")}>
            {t(`message.${value}`)}
          </button>)}
        </div>
        <label className="block text-sm"><span>{t("ops.message")}</span>
          <textarea ref={composerRef} aria-label={t("ops.message")} value={composer.text} maxLength={64 * 1024} rows={3} disabled={!canWrite}
            onChange={event => composer.edit(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); }
            }} className="mt-1 min-h-11 w-full min-w-0 resize-y rounded-lg border border-border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
        </label>
        <button onClick={onSend} disabled={blocked || composer.pending || !!composer.intent || !!composer.storageError || !composer.text.trim()}
          className="min-h-11 min-w-11 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
          {composerTab === "announcement" ? <Megaphone className="size-4" /> : <Send className="size-4" />}
          {t(composer.pending ? "message.pending" : "message.send")}
        </button>
      </div>
    </div>
  );
});

// ── message rendering ──
function bubbleSide(role: string): "them" | "me" | "mech" {
  if (role === "dispatcher" || role === "manager") return "me";
  if (role === "mechanic") return "mech";
  return "them";
}

function MessageBubble({ m }: { m: ConvMessage }) {
  const { t } = useI18n();
  const side = bubbleSide(m.author_role);
  if (m.is_internal && m.kind === "note") {
    return (
      <div className="mx-auto w-[88%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">{t("message.note")}</p>
        <p className="text-[13px] text-amber-900 whitespace-pre-wrap">{renderMentions(m.body)}</p>
      </div>
    );
  }
  return (
    <div className={cn("max-w-[74%]", side === "me" ? "ml-auto" : "")}>
      <p className={cn("text-[10px] font-bold mb-1 px-1", side === "me" ? "text-primary dark:text-blue-300 text-right" : roleColor(m.author_role))}>
        {m.author_name ?? m.author_role}
      </p>
      {m.body && (
        <div className={cn("px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap",
          side === "me" ? "bg-primary text-primary-foreground rounded-br-sm"
            : side === "mech" ? "bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-bl-sm"
              : "bg-card border border-border rounded-bl-sm")}>
          {m.body}
        </div>
      )}
      {m.attachments.map((a) => (
        <div key={a.id} className={cn("mt-1 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px]", side === "me" && "ml-auto")}>
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-sm">
            {a.kind === "photo" ? "📷" : a.kind === "location" ? "📍" : a.kind === "voice" ? "🎤" : "📄"}
          </span>
          <span className="font-medium text-foreground">{a.label}</span>
        </div>
      ))}
      <p className={cn("text-[10px] text-muted-foreground mt-1 px-1", side === "me" && "text-right")}>{relTime(m.created_at)}</p>
    </div>
  );
}

function MiniBubble({ role, name, body, date }: { role: string; name: string; body: string | null; date: string | null }) {
  const side = bubbleSide(role);
  return (
    <div className={cn("max-w-[70%]", side === "me" ? "ml-auto" : "")}>
      <span className={cn("text-[10px] font-bold px-1", side === "me" ? "text-primary dark:text-blue-300" : roleColor(role))}>{name}</span>
      <div className={cn("px-3 py-1.5 rounded-xl text-[12.5px]",
        side === "me" ? "bg-primary text-primary-foreground" : side === "mech" ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-card border border-border")}>
        {body ?? "—"}
      </div>
    </div>
  );
}

function EventLine({ icon, title, detail, date }: { icon: string; title: string; detail: string | null; date: string | null }) {
  return (
    <div className="flex items-center gap-2 justify-center text-[11.5px] text-muted-foreground">
      <span className="text-sm">{icon}</span>
      <span className="font-medium text-slate-600 dark:text-slate-300">{title}</span>
      {detail && <span>· {detail}</span>}
      <span className="text-muted-foreground/70 dark:text-muted-foreground">· {relTime(date)}</span>
    </div>
  );
}

function renderMentions(body: string | null) {
  if (!body) return null;
  return body.split(/(@\w+)/g).map((part, i) =>
    part.startsWith("@")
      ? <span key={i} className="font-bold text-purple-600 bg-purple-100 rounded px-1">{part}</span>
      : <span key={i}>{part}</span>);
}
