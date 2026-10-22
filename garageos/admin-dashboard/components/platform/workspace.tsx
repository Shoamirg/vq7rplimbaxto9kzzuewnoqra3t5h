'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@garageos/design-system';
import { Building2, Users, Contact, Car, CalendarDays, Receipt, Wallet } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { clientFetch, ClientApiError } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/context';
import { logoutMessageSession } from '@/lib/message-intents';
import { authTransitionFailureKey, captureAuthOwnership } from '@/lib/auth-transition';

const kinds = ['centers', 'staff', 'customers', 'vehicles', 'appointments', 'invoices', 'payments'] as const;
type Kind = typeof kinds[number];
const kindIcons = { centers: Building2, staff: Users, customers: Contact, vehicles: Car, appointments: CalendarDays, invoices: Receipt, payments: Wallet };
type RecordRow = { id: string; service_center_id: string; garage: string; title: string; is_active: boolean; fields: Record<string, string | null> };
type Page = { items: RecordRow[]; total: number; page: number; page_size: number };
type Stats = { counts: Record<string, number>; money: { currency: string; invoiced: string; received: string; refunds: string; net_received: string }[] };

export function PlatformWorkspace({ name, allowed, authFingerprint }: { name: string; allowed: boolean; authFingerprint: string | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [denied, setDenied] = useState(!allowed);
  const [filters, setFilters] = useState({ kind: 'centers' as Kind, q: '', start: '', end: '', page: 1, center: '', garage: '' });
  const [query, setQuery] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState<{ records: Page; stats: Stats } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutOwner] = useState(captureAuthOwnership);
  useEffect(() => {
    if (denied) return;
    const abort = new AbortController();
    const params = new URLSearchParams();
    if (filters.center) params.set('center_id', filters.center);
    if (filters.start) params.set('start', filters.start);
    if (filters.end) params.set('end', filters.end);
    const list = new URLSearchParams(params);
    list.set('q', filters.q); list.set('page', String(filters.page));
    setLoading(true); setError(null); setData(null);
    Promise.all([
      clientFetch<Page>(`/platform/records/${filters.kind}?${list}`, { signal: abort.signal }),
      clientFetch<Stats>(`/platform/stats?${params}`, { signal: abort.signal }),
    ]).then(([records, stats]) => { if (!abort.signal.aborted) setData({ records, stats }); })
      .catch((err) => {
        if (abort.signal.aborted) return;
        if (err instanceof ClientApiError && [401, 403].includes(err.status)) setDenied(true);
        setError(err instanceof ClientApiError && err.status === 422 ? 'platform.invalid_dates' : 'platform.failed');
      }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [filters, revision, denied]);

  async function logout() {
    setLogoutError(null);
    try {
      await logoutMessageSession(destination => { router.replace(destination); router.refresh(); }, logoutOwner, authFingerprint, () => { setData(null); setDenied(true); });
    } catch (error) { setLogoutError(authTransitionFailureKey(error)); }
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    setFilters((old) => ({ ...old, q: query.trim(), start, end, page: 1 }));
  }
  function value(key: string, raw: string | null): string {
    if (raw === null) return t('platform.not_set');
    if (['role', 'kind', 'status', 'method'].includes(key)) {
      const lookup = `platform.value.${raw}`;
      const label = t(lookup);
      return label === lookup ? raw : label;
    }
    if (['issued_at', 'received_at'].includes(key)) return new Date(raw).toLocaleString(locale === 'uz' ? 'uz-UZ' : locale, { timeZone: 'UTC' });
    if (['amount', 'total', 'balance'].includes(key)) return new Intl.NumberFormat(locale).format(Number(raw));
    return raw;
  }
  return <div className="platform-workspace min-h-screen bg-background text-foreground">
    {!denied && <nav className="platform-dock garage-dock" aria-label={t('platform.records')}>
      {kinds.map(kind => { const Icon = kindIcons[kind]; return <button key={kind} type="button" title={t(`platform.${kind}`)} aria-label={t(`platform.${kind}`)} aria-pressed={filters.kind === kind} onClick={() => { setQuery(''); setFilters(old => ({ ...old, kind, q: '', page: 1 })); }}><Icon size={22}/><span>{t(`platform.${kind}`)}</span></button>; })}
    </nav>}
    <header className="border-b border-border px-4 py-4 sm:px-8 flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{t('platform.brand')}</p><p className="text-sm text-muted-foreground">{name}</p></div>
      <div className="flex items-center gap-2"><LanguageSwitcher /><Button variant="secondary" onClick={logout}>{t('platform.logout')}</Button></div>
    </header>
    <main className="mx-auto max-w-6xl p-4 sm:p-8 space-y-6">
      <div><h1 className="text-2xl font-semibold">{t('platform.title')}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{t('platform.hint')}</p></div>
      {logoutError && <p role="alert" className="text-destructive">{t(logoutError)}</p>}
      {denied ? <p role="alert" className="rounded-lg border border-border p-4">{t('platform.denied')}</p> : <>
        <form onSubmit={apply} className="bento-panel p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="space-y-1 text-sm"><span className="block">{t('platform.records')}</span><select value={filters.kind} onChange={(e) => { setQuery(''); setFilters((old) => ({ ...old, kind: e.target.value as Kind, q: '', page: 1 })); }} className="w-full rounded-lg border border-border bg-background px-3 py-2">{kinds.map((kind) => <option key={kind} value={kind}>{t(`platform.${kind}`)}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span className="block">{t('platform.search')}</span><input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span className="block">{t('platform.start')}</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span className="block">{t('platform.end')}</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <Button type="submit">{t('platform.apply')}</Button>
        </form>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>{filters.garage || t('platform.all_centers')}</span>{filters.center && <Button variant="secondary" onClick={() => setFilters((old) => ({ ...old, center: '', garage: '', page: 1 }))}>{t('platform.all_centers')}</Button>}</div>
        <p className="text-sm text-muted-foreground">{t('platform.date_hint')}</p>
        {loading ? <p role="status">{t('platform.loading')}</p> : error ? <p role="alert" className="text-destructive">{t(error)} <Button variant="secondary" onClick={() => setRevision((old) => old + 1)}>{t('platform.retry')}</Button></p> : data && <>
          <section aria-label={t('platform.statistics')} className="border-y border-border py-4 space-y-4">
            <h2 className="font-semibold">{t('platform.statistics')}</h2>
            <p className="text-sm text-muted-foreground">{t('platform.count_hint')}</p>
            <dl className="platform-stats">{Object.entries(data.stats.counts).map(([key, count]) => <div key={key}><dt className="text-sm text-muted-foreground">{t(`platform.${key}`)}</dt><dd className="text-lg font-semibold tabular-nums">{new Intl.NumberFormat(locale).format(count)}</dd></div>)}</dl>
            {data.stats.money.length === 0 ? <p className="text-sm text-muted-foreground">{t('platform.no_money')}</p> : data.stats.money.map((money) => <div key={money.currency} className="space-y-2"><h3 className="font-medium">{money.currency}</h3><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(['invoiced', 'received', 'refunds', 'net_received'] as const).map((key) => <div key={key}><dt className="text-sm text-muted-foreground">{t(`platform.${key}`)}</dt><dd className="font-semibold tabular-nums wrap-break-word">{new Intl.NumberFormat(locale).format(Number(money[key]))}</dd></div>)}</dl></div>)}
          </section>
          <section aria-label={t('platform.records')} className="space-y-3">
            <h2 className="font-semibold">{t(`platform.${filters.kind}`)} <span className="text-muted-foreground">({data.records.total})</span></h2>
            {data.records.items.length === 0 ? <p className="rounded-lg border border-border p-4">{t('platform.empty')}</p> : <ul className="platform-records">{data.records.items.map((row) => <li key={row.id} className="py-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><h3 className="font-medium wrap-break-word">{filters.kind === 'appointments' ? new Date(row.title).toLocaleDateString(locale === 'uz' ? 'uz-UZ' : locale, { timeZone: 'UTC' }) : row.title}</h3><p className="text-sm text-muted-foreground wrap-break-word">{row.garage}</p></div><span className="text-sm">{t(row.is_active ? 'platform.active' : 'platform.inactive')}</span></div>
              {filters.kind === 'centers' && <Button variant="secondary" onClick={() => { setQuery(''); setFilters((old) => ({ ...old, center: row.id, garage: row.title, kind: 'staff', q: '', page: 1 })); }}>{t('platform.view_center')}</Button>}
              <details className="text-sm"><summary className="cursor-pointer text-primary">{t('platform.details')}</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className="min-w-0"><dt className="text-muted-foreground">{t('platform.record_id')}</dt><dd className="break-all">{row.id}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">{t('platform.center_id')}</dt><dd className="break-all">{row.service_center_id}</dd></div>{Object.entries(row.fields).map(([key, raw]) => <div key={key} className="min-w-0"><dt className="text-muted-foreground">{t(`platform.field.${key}`)}</dt><dd className="wrap-break-word">{value(key, raw)}</dd></div>)}</dl></details>
            </li>)}</ul>}
            <div className="flex flex-wrap justify-center items-center gap-3"><Button variant="secondary" disabled={filters.page === 1} onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}>{t('platform.previous')}</Button><span className="text-sm">{t('platform.page', { page: filters.page, total: Math.max(1, Math.ceil(data.records.total / 30)) })}</span><Button variant="secondary" disabled={filters.page * 30 >= data.records.total} onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}>{t('platform.next')}</Button></div>
          </section>
        </>}
      </>}
    </main>
  </div>;
}
