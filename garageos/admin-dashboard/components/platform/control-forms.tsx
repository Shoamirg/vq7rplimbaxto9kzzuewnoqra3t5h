'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@garageos/design-system';
import { useI18n } from '@/lib/i18n/context';
import { controlApi, slugify, type PlatformTree } from '@/lib/platform/control-api';
import { controlErrorKey } from './control-detail';

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-sm min-w-0"><span className="block">{label}</span>{children}</label>;
}

interface FormProps { onDone: (createdId: string | null) => void }

export function NewNetworkForm({ onDone }: FormProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [exclusive, setExclusive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await controlApi.createNetwork({ name: name.trim(), slug: slug || slugify(name), is_exclusive: exclusive });
      onDone(created.id);
    } catch (err) { setError(controlErrorKey(err)); setBusy(false); }
  }
  return <form onSubmit={submit} className="bento-panel p-6 space-y-4" aria-labelledby="control-new-network">
    <h2 id="control-new-network" className="text-lg font-semibold">{t('control.new_network')}</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('control.name')}><input value={name} required maxLength={160} className={inputClass}
        onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></Field>
      <Field label={t('control.slug')}><input value={slug} required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={inputClass}
        onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} /></Field>
    </div>
    <label className="control-switch text-sm">
      <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
      <span><strong className="block">{t('control.exclusive_label')}</strong><span className="text-muted-foreground">{t('control.exclusive_help')}</span></span>
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy || !name.trim()}>{t('control.create')}</Button>
      <Button type="button" variant="secondary" onClick={() => onDone(null)}>{t('control.cancel')}</Button></div>
  </form>;
}

export function NewWorkshopForm({ tree, defaultNetworkId, onDone }: FormProps & { tree: PlatformTree; defaultNetworkId: string | null }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', timezone: 'Asia/Tashkent',
    network_id: defaultNetworkId ?? '', admin_name: '', admin_email: '', admin_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await controlApi.createWorkshop({
        name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined, timezone: form.timezone.trim(), network_id: form.network_id || null,
        admin: { full_name: form.admin_name.trim(), email: form.admin_email.trim(), password: form.admin_password },
      });
      onDone(created.id);
    } catch (err) { setError(controlErrorKey(err)); setBusy(false); }
  }
  const text = (key: keyof typeof form, label: string, extra: Record<string, unknown> = {}) =>
    <Field label={label}><input value={form[key]} onChange={(e) => set(key)(e.target.value)} className={inputClass} {...extra} /></Field>;
  return <form onSubmit={submit} className="bento-panel p-6 space-y-4" aria-labelledby="control-new-workshop">
    <h2 id="control-new-workshop" className="text-lg font-semibold">{t('control.new_workshop')}</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      {text('name', t('control.name'), { required: true, maxLength: 255 })}
      <Field label={t('control.network')}><select value={form.network_id} onChange={(e) => set('network_id')(e.target.value)} className={inputClass}>
        <option value="">{t('control.no_network')}</option>
        {tree.networks.filter((n) => n.is_active).map((n) => <option key={n.id} value={n.id}>{n.name}{n.is_exclusive ? ` · ${t('control.exclusive')}` : ''}</option>)}
      </select></Field>
      {text('email', t('control.email'), { type: 'email', maxLength: 255 })}
      {text('phone', t('control.phone'), { type: 'tel', maxLength: 50 })}
      {text('address', t('control.address'), { maxLength: 500 })}
      {text('timezone', t('control.timezone'), { required: true, maxLength: 50 })}
    </div>
    <fieldset className="grid gap-4 sm:grid-cols-3 border-t border-border pt-4">
      <legend className="font-medium">{t('control.admin_section')}</legend>
      {text('admin_name', t('control.admin_name'), { required: true, maxLength: 255 })}
      {text('admin_email', t('control.admin_email'), { required: true, type: 'email', maxLength: 255, autoComplete: 'off' })}
      {text('admin_password', t('control.admin_password'), { required: true, type: 'password', minLength: 12, maxLength: 72, autoComplete: 'new-password' })}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy}>{t('control.create')}</Button>
      <Button type="button" variant="secondary" onClick={() => onDone(null)}>{t('control.cancel')}</Button></div>
  </form>;
}
