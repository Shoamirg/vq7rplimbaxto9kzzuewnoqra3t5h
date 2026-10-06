"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@garageos/design-system';
import { clientFetch, ClientApiError } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/context';

type Account = { email: string; is_active: boolean };
export function CustomerAccount({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null); setLoadFailed(false);
    clientFetch<Account | null>(`/customers/${customerId}/account`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setAccount(data); })
      .catch((err) => { if (!controller.signal.aborted) {
        setLoadFailed(true); setAccount(null);
        if (err instanceof ClientApiError && [401, 403].includes(err.status)) { setDenied(true); setPassword(''); }
        setError('accounts.load_failed');
      } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customerId, revision]);
  async function save(event?: FormEvent) {
    event?.preventDefault(); if (saving) return;
    setSaving(true); setError(null);
    try {
      const result = await clientFetch<Account>(`/customers/${customerId}/account`, {
        method: account ? 'PATCH' : 'POST', body: JSON.stringify(account
          ? { is_active: !account.is_active } : { email: email.trim(), password }),
      });
      setAccount(result); setPassword('');
    } catch (err) {
      if (err instanceof ClientApiError && [401, 403].includes(err.status)) { setDenied(true); setPassword(''); setAccount(null); }
      setError(err instanceof ClientApiError && err.status === 409 ? 'accounts.duplicate'
        : err instanceof ClientApiError && err.status === 422 ? 'accounts.invalid' : 'accounts.failed');
    } finally { setSaving(false); }
  }
  return <section className="rounded-xl border border-border bg-card p-5 space-y-4">
    <h2 className="text-lg font-semibold">{t('customer_account.title')}</h2>
    <p className="text-sm text-muted-foreground">{t('customer_account.hint')}</p>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)} <button type="button" className="underline" onClick={() => setRevision((value) => value + 1)}>{t('accounts.retry')}</button></p>}
    {denied ? <p role="alert">{t('accounts.denied')}</p> : loading ? <p role="status">{t('accounts.loading')}</p> : account ? <>
      <p className="break-all">{account.email} · {t(account.is_active ? 'accounts.active' : 'accounts.inactive')}</p>
      <Button disabled={saving} variant="secondary" onClick={() => save()}>{t(account.is_active ? 'customer_account.suspend' : 'customer_account.restore')}</Button>
    </> : !loadFailed && <form onSubmit={save} aria-label={t('customer_account.title')} className="space-y-4">
      <label className="block space-y-1 text-sm"><span>{t('accounts.email')}</span><input type="email" required maxLength={255} disabled={saving} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
      <label className="block space-y-1 text-sm"><span>{t('accounts.password')}</span><input type="password" required minLength={10} maxLength={72} autoComplete="new-password" disabled={saving} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
      <p className="text-xs text-muted-foreground">{t('customer_account.password_hint')}</p>
      <div className="flex justify-end"><Button type="submit" disabled={saving}>{t('customer_account.create')}</Button></div>
    </form>}
  </section>;
}
