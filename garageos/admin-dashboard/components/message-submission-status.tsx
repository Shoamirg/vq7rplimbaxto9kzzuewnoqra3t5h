"use client";

import { useI18n } from "@/lib/i18n/context";
import type { MessageIntent, MessageStorageError } from "@/lib/message-intents";

type ComposerState = {
  intent?: MessageIntent; pending: boolean; saved: boolean; storageError: MessageStorageError | null;
  acknowledged: boolean;
  newerDraft: boolean; canRecover: boolean; retry: () => void; resolve: () => void; retryStorage: () => void;
};
const control = "min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function MessageSubmissionStatus({ composer, showSaved = true }: { composer: ComposerState; showSaved?: boolean }) {
  const { t } = useI18n(), { intent, pending, saved, storageError } = composer;
  return <div className="min-w-0 space-y-2 text-sm [overflow-wrap:anywhere]">
    {storageError && <div role="alert" className="space-y-2"><p>{t(composer.acknowledged ? "message.storage_ack" : "message.storage")}</p><button className={control} onClick={composer.retryStorage}>{t("message.storage_retry")}</button></div>}
    {saved && showSaved && <p role="status">{t("message.saved")}</p>}
    {intent && !composer.acknowledged && <div role={pending ? "status" : "alert"} className="space-y-2 rounded-lg border border-border p-3">
      <p>{t(`message.${pending ? "pending" : intent.status === "pending" ? "uncertain" : intent.status}`)}</p>
      <p className="font-medium">{t("message.original")} · {t(`message.${intent.mode}`)}</p>
      <div role="region" aria-label={t("message.original")} tabIndex={0} className="max-h-32 overflow-y-auto whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-primary"><p>{intent.payload.body}</p></div>
      {composer.newerDraft && <p>{t("message.newer")}</p>}
      {!pending && ["uncertain", "suspended"].includes(intent.status) && <button className={control} disabled={!composer.canRecover} onClick={composer.retry}>{t("message.retry")}</button>}
      {!pending && ["rejected", "conflict"].includes(intent.status) && <button className={control} onClick={composer.resolve}>{t("message.resolve")}</button>}
    </div>}
  </div>;
}
