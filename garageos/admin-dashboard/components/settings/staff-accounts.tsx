"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@garageos/design-system';
import { Loader2, Pencil, Plus, Search, ShieldCheck } from 'lucide-react';
import { clientFetch, ClientApiError } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/context';

type EmployeeRole = 'mechanic' | 'manager' | 'receptionist';
type Employee = { id: string; full_name: string; email: string; phone: string | null;
  role: string; is_active: boolean; editable: boolean };
type StaffPage = { items: Employee[]; total: number; page: number; total_pages: number };
type Editor = { id?: string; full_name: string; email: string; phone: string;
  password: string; role: EmployeeRole; is_active: boolean };
const field = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary';
const roles: EmployeeRole[] = ['mechanic', 'manager', 'receptionist'];
const roleKeys: Record<string, string> = { mechanic: 'accounts.mechanic', manager: 'accounts.manager',
  receptionist: 'accounts.receptionist', admin: 'accounts.admin', super_admin: 'accounts.super_admin' };

export function StaffAccounts({ allowed }: { allowed: boolean }) {
  const { t } = useI18n();
  const [query, setQuery] = useState({ q: '', page: 1 });
  const [result, setResult] = useState<StaffPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [denied, setDenied] = useState(!allowed);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const editorId = editor ? editor.id ?? 'new' : null;

  useEffect(() => {
    if (!allowed || denied) return;
    const controller = new AbortController();
    setLoading(true); setLoadError(false);
    const timer = setTimeout(() => {
      clientFetch<StaffPage>(`/staff?q=${encodeURIComponent(query.q)}&page=${query.page}`, { signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) setResult(data); })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (error instanceof ClientApiError && [401, 403].includes(error.status)) {
            setDenied(true); setResult(null); setEditor(null);
          } else { setLoadError(true); }
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query.q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [allowed, denied, query, revision]);

  useEffect(() => { if (editorId) nameRef.current?.focus(); }, [editorId]);

  function open(employee?: Employee) {
    setSaved(false); setErrorKey(null);
    setEditor({ id: employee?.id, full_name: employee?.full_name ?? '', email: employee?.email ?? '',
      phone: employee?.phone ?? '', password: '', role: (employee?.role ?? 'mechanic') as EmployeeRole,
      is_active: employee?.is_active ?? true });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    setSaving(true); setErrorKey(null); setSaved(false);
    try {
      const common = { full_name: editor.full_name.trim(), phone: editor.phone.trim() || null, role: editor.role };
      await clientFetch<Employee>(editor.id ? `/staff/${editor.id}` : '/staff', {
        method: editor.id ? 'PATCH' : 'POST',
        body: JSON.stringify(editor.id ? { ...common, is_active: editor.is_active }
          : { ...common, email: editor.email.trim(), password: editor.password }),
      });
      setEditor(null); setSaved(true); setRevision((value) => value + 1);
    } catch (error) {
      if (error instanceof ClientApiError && [401, 403].includes(error.status)) {
        setDenied(true); setResult(null); setEditor(null);
      } else {
        setErrorKey(error instanceof ClientApiError && error.status === 409 ? 'accounts.duplicate'
          : error instanceof ClientApiError && error.status === 422 ? 'accounts.invalid' : 'accounts.failed');
      }
    } finally { setSaving(false); }
  }

  return <section className="mx-auto w-full max-w-5xl space-y-6 p-4 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">{t('accounts.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('accounts.subtitle')}</p></div>
      {!denied && <Button disabled={saving || !!editor} onClick={() => open()} leftIcon={<Plus className="size-4" />}>{t('accounts.add')}</Button>}
    </header>
    {denied ? <p role="alert" className="rounded-lg border border-border bg-card p-4">{t('accounts.denied')}</p> : <>
      {saved && <p role="status" className="text-sm text-foreground">{t('accounts.saved')}</p>}
      {editor && <form onSubmit={save} aria-label={t(editor.id ? 'accounts.edit' : 'accounts.add')}
        className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t(editor.id ? 'accounts.edit' : 'accounts.add')}</h2>
        {errorKey && <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p>}
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>{t('accounts.name')}</span><input ref={nameRef} className={field} required maxLength={255} autoComplete="name" value={editor.full_name} onChange={(e) => setEditor({ ...editor, full_name: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span>{t('accounts.email')}</span><input className={field} type="email" required maxLength={255} autoComplete="off" disabled={!!editor.id} value={editor.email} onChange={(e) => setEditor({ ...editor, email: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span>{t('accounts.phone')}</span><input className={field} type="tel" maxLength={50} autoComplete="tel" value={editor.phone} onChange={(e) => setEditor({ ...editor, phone: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span>{t('accounts.role')}</span><select className={field} value={editor.role} onChange={(e) => setEditor({ ...editor, role: e.target.value as EmployeeRole })}>{roles.map((role) => <option key={role} value={role}>{t(roleKeys[role])}</option>)}</select></label>
          {!editor.id && <div className="space-y-1 text-sm sm:col-span-2"><label htmlFor="staff-initial-password">{t('accounts.password')}</label><input id="staff-initial-password" aria-describedby="initial-password-hint" className={field} type="password" required minLength={10} maxLength={72} autoComplete="new-password" value={editor.password} onChange={(e) => setEditor({ ...editor, password: e.target.value })} /><p id="initial-password-hint" className="text-xs text-muted-foreground">{t('accounts.password_hint')}</p></div>}
          {editor.id && <div className="space-y-2 sm:col-span-2"><label className="space-y-1 text-sm"><span>{t('accounts.status')}</span><select className={field} value={String(editor.is_active)} onChange={(e) => setEditor({ ...editor, is_active: e.target.value === 'true' })}><option value="true">{t('accounts.active')}</option><option value="false">{t('accounts.inactive')}</option></select></label><p className="text-xs text-muted-foreground">{t('accounts.access_hint')}</p></div>}
        </fieldset>
        <footer className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => { setEditor(null); setErrorKey(null); }}>{t('accounts.cancel')}</Button>
          <Button type="submit" disabled={saving} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : undefined}>{t(saving ? 'accounts.saving' : 'accounts.save')}</Button>
        </footer>
      </form>}
      <label className="relative block"><span className="sr-only">{t('accounts.search')}</span><Search aria-hidden className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input type="search" className={`${field} pl-9`} maxLength={100} placeholder={t('accounts.search')} value={query.q} onChange={(e) => setQuery({ q: e.target.value, page: 1 })} /></label>
      {loading && <p role="status" className="text-sm text-muted-foreground">{t('accounts.loading')}</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">{t('accounts.load_failed')} <button type="button" className="underline focus-visible:outline-solid focus-visible:outline-primary" onClick={() => setRevision((value) => value + 1)}>{t('accounts.retry')}</button></p>}
      {!loading && !loadError && result?.items.length === 0 && <div className="space-y-2 py-8"><h2 className="font-semibold">{t('accounts.empty')}</h2><p className="text-sm text-muted-foreground">{t('accounts.empty_hint')}</p></div>}
      {!loadError && result && <ul aria-busy={loading} className="divide-y divide-border rounded-xl border border-border bg-card">
        {result.items.map((employee) => <li key={employee.id} data-testid={`staff-${employee.id}`} className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div className="w-full min-w-0 flex-1 sm:w-auto"><h2 className="wrap-break-word font-semibold">{employee.full_name}</h2><p className="break-all text-sm text-muted-foreground">{employee.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(roleKeys[employee.role] ?? 'accounts.protected')} · {t(employee.is_active ? 'accounts.active' : 'accounts.inactive')}</p></div>
          {employee.editable ? <Button variant="secondary" size="sm" disabled={saving || loading || !!editor} onClick={() => open(employee)} leftIcon={<Pencil className="size-4" />}>{t('accounts.edit')}</Button>
            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-4" />{t('accounts.protected')}</span>}
        </li>)}
      </ul>}
      {result && result.total > 0 && <nav aria-label={t('accounts.title')} className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('accounts.page', { page: result.page, pages: result.total_pages, total: result.total })}</p>
        <div className="flex gap-2"><Button variant="secondary" disabled={loading || loadError || query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>{t('accounts.previous')}</Button>
          <Button variant="secondary" disabled={loading || loadError || query.page >= result.total_pages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>{t('accounts.next')}</Button></div>
      </nav>}
    </>}
  </section>;
}
