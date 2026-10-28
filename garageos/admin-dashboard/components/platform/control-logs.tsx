'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@garageos/design-system';
import { useI18n } from '@/lib/i18n/context';
import { controlApi, type AuditPage, type Selection } from '@/lib/platform/control-api';

/** Audit trail scoped to the selected network/workshop (or the whole platform).
 *  The parent keys this by scope, so switching selection starts again at page 1. */
export function ControlLogs({ selection, scopeLabel }: { selection: Selection; scopeLabel: string }) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ page: String(page), action });
    if (selection?.kind === 'workshop') params.set('center_id', selection.id);
    if (selection?.kind === 'network') params.set('network_id', selection.id);
    setData(null); setFailed(false);
    controlApi.audit(params, abort.signal).then(setData)
      .catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [selection, action, page, revision]);
  function apply(event: FormEvent) { event.preventDefault(); setPage(1); setAction(draft.trim()); }
  const formatter = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : locale, { dateStyle: 'medium', timeStyle: 'short' });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  return <section className="bento-panel p-6 space-y-4" aria-labelledby="control-logs-title">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="control-logs-title" className="text-lg font-semibold">{t('control.logs')}</h2><p className="text-sm text-muted-foreground wrap-break-word">{scopeLabel}</p></div>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm"><span className="block">{t('control.logs_filter')}</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={64} className="rounded-lg border border-border bg-background px-3 py-2" /></label>
        <Button type="submit" variant="secondary">{t('platform.apply')}</Button>
      </form>
    </div>
    {failed ? <p role="alert" className="text-destructive">{t('control.failed')} <Button variant="secondary" onClick={() => setRevision((r) => r + 1)}>{t('control.retry')}</Button></p>
      : data === null ? <p role="status">{t('control.loading')}</p>
      : data.items.length === 0 ? <p className="text-muted-foreground">{t('control.logs_empty')}</p>
      : <ol className="control-logs">{data.items.map((entry) => <li key={entry.id} data-status={entry.status}>
        <time dateTime={entry.created_at} className="text-sm text-muted-foreground tabular-nums">{formatter.format(new Date(entry.created_at))}</time>
        <code className="wrap-break-word">{entry.action}</code>
        <span className="text-sm wrap-break-word">{entry.actor_email ?? t('control.log_system')}{entry.garage ? ` · ${entry.garage}` : ''}</span>
        <span className="control-badge" data-tone={entry.status}>{t(`control.status.${entry.status}`)}</span>
      </li>)}</ol>}
    {data && data.total > data.page_size && <div className="flex flex-wrap justify-center items-center gap-3">
      <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t('control.previous')}</Button>
      <span className="text-sm">{t('control.page', { page, total: pages })}</span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t('control.next')}</Button>
    </div>}
  </section>;
}
