"use client";

import { useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogTitle } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";
import type { ChoiceKind, ChoicePage, ConversationChoice, SelectedChoices } from "@/lib/inbox-choices";
import { CHOICE_KINDS, choiceQuery } from "@/lib/inbox-choices";
import type { MessageActor } from "@/lib/message-intents";
import { ClientApiError } from "@/lib/api/client";
import { useOperationRead } from "../operations/use-operation-read";

const control = "min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function ChoicePicker({ kind, selected, actor, enabled, isAuthorized, onDenied, onChoose, onClose, opener }: {
  kind: ChoiceKind; selected: SelectedChoices; actor: MessageActor; enabled: boolean;
  isAuthorized: () => boolean; onDenied: (error: unknown) => void;
  onChoose: (value: ConversationChoice | null) => void; onClose: () => void;
  opener: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const query = choiceQuery(kind, selected, search, offset);
  const dependent = CHOICE_KINDS.filter(other => other !== kind && other !== "assignee" && selected[other]);
  const key = `${actor.center}:${actor.id}:${query}`;
  const read = useOperationRead<ChoicePage>(key, `/conversations/choices?${query}`,
    enabled && isAuthorized(), onDenied, false);
  const invalidContext = read.error instanceof ClientApiError && [404, 422].includes(read.error.status);
  const choose = (value: ConversationChoice | null) => {
    if (!enabled || !isAuthorized() || value && (read.loading || !!read.error)) return;
    onChoose(value); onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent hideClose aria-describedby={undefined}
      onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}
      className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto p-4 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DialogTitle>{t(`inbox.choice.${kind}`)}</DialogTitle>
        <button type="button" className={control} onClick={onClose}>{t("common.close")}</button>
      </div>
      {!!dependent.length && <p className="mt-3 text-sm">{t("inbox.choice.dependencies", {
        fields: dependent.map(other => t(`inbox.choice.${other}`)).join(", "),
      })}</p>}
      <label className="mt-3 block text-sm">{t("inbox.choice.search")}
        <input className={`${control} mt-1 w-full`} value={search} maxLength={200}
          onChange={event => { setSearch(event.target.value); setOffset(0); }} />
      </label>
      <button type="button" className={`${control} my-3`} disabled={!enabled} onClick={() => choose(null)}>{t("inbox.choice.clear")}</button>
      {read.loading && <p role="status" className="py-2 text-sm">{t("ops.loading")}</p>}
      {!!read.error && <div role="alert" className="space-y-2 py-2 text-sm">
        <p>{t(invalidContext ? "inbox.choice.invalid_context" : read.error instanceof ClientApiError && read.error.code === "INBOX_SEARCH_UNAVAILABLE" ? "ops.search_unavailable" : "inbox.choice.error")}</p>
        {!invalidContext && <button type="button" className={control} onClick={() => void read.refresh()}>{t("inbox.choice.retry")}</button>}
      </div>}
      {!read.loading && !read.error && read.data && <>
        <p className="mb-2 text-sm text-muted-foreground">{t("inbox.choice.results", { total: read.data.total })}</p>
        {!read.data.items.length && <p role="status" className="py-2 text-sm">{t("inbox.choice.empty")}</p>}
        <div className="space-y-2">{read.data.items.map(row => <button type="button" key={row.id}
          disabled={!enabled} className={`${control} flex w-full flex-col items-start gap-1 text-left`}
          onClick={() => choose(row)}><span>{row.label}</span><span className="text-xs text-muted-foreground">{row.id}</span></button>)}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={control} disabled={read.data.offset === 0}
            onClick={() => setOffset(Math.max(0, read.data!.offset - read.data!.limit))}>{t("inbox.choice.previous")}</button>
          <button type="button" className={control} disabled={!read.data.has_more}
            onClick={() => setOffset(read.data!.offset + read.data!.limit)}>{t("inbox.choice.next")}</button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
