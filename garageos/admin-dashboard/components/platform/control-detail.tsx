'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@garageos/design-system';
import { ClientApiError } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/context';
import {
  controlApi, STAFF_ROLES, type NetworkNode, type PlatformTree, type StaffMember, type WorkshopNode,
} from '@/lib/platform/control-api';

const KNOWN_ERRORS = ['NETWORK_SLUG_UNAVAILABLE', 'WORKSHOP_EMAIL_UNAVAILABLE', 'STAFF_EMAIL_UNAVAILABLE'];

/** Map an API failure to a dictionary key the operator can act on. */
export function controlErrorKey(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.code && KNOWN_ERRORS.includes(error.code)) return `control.error.${error.code}`;
    if (error.status === 422) return 'control.error.validation';
  }
  return 'control.save_failed';
}

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; key: string };

function useSave(onChanged: () => void) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  async function run(action: () => Promise<unknown>) {
    setStatus({ kind: 'saving' });
    try { await action(); setStatus({ kind: 'saved' }); onChanged(); }
    catch (error) { setStatus({ kind: 'error', key: controlErrorKey(error) }); }
  }
  return { status, run };
}

function StatusLine({ status }: { status: Status }) {
  const { t } = useI18n();
  if (status.kind === 'saved') return <p role="status" className="text-sm text-muted-foreground">{t('control.saved')}</p>;
  if (status.kind === 'error') return <p role="alert" className="text-sm text-destructive">{t(status.key)}</p>;
  return null;
}

export function NetworkDetail({ network, onChanged }: { network: NetworkNode; onChanged: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(network.name);
  const [exclusive, setExclusive] = useState(network.is_exclusive);
  const { status, run } = useSave(onChanged);
  function save(event: FormEvent) {
    event.preventDefault();
    run(() => controlApi.updateNetwork(network.id, { name: name.trim(), is_exclusive: exclusive }));
  }
  return <section className="bento-panel p-6 space-y-4" aria-labelledby="control-network-title">
    <div>
      <h2 id="control-network-title" className="text-xl font-semibold wrap-break-word">{network.name}</h2>
      <p className="text-sm text-muted-foreground">{network.slug} · {t('control.workshops_count', { count: network.workshops.length })}</p>
    </div>
    <form onSubmit={save} className="space-y-4">
      <label className="block space-y-1 text-sm"><span>{t('control.name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
      <label className="control-switch text-sm">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        <span><strong className="block">{t('control.exclusive_label')}</strong><span className="text-muted-foreground">{t('control.exclusive_help')}</span></span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={status.kind === 'saving' || !name.trim()}>{t('control.save')}</Button>
        <Button type="button" variant="secondary" disabled={status.kind === 'saving'}
          onClick={() => run(() => controlApi.updateNetwork(network.id, { is_active: !network.is_active }))}>
          {t(network.is_active ? 'control.archive' : 'control.restore')}
        </Button>
      </div>
      <StatusLine status={status} />
    </form>
  </section>;
}

interface WorkshopDetailProps { workshop: WorkshopNode; tree: PlatformTree; onChanged: () => void }

export function WorkshopDetail({ workshop, tree, onChanged }: WorkshopDetailProps) {
  const { t } = useI18n();
  const [name, setName] = useState(workshop.name);
  const [networkId, setNetworkId] = useState(workshop.network_id ?? '');
  const { status, run } = useSave(onChanged);
  const networks = tree.networks.filter((n) => n.is_active || n.id === workshop.network_id);
  function save(event: FormEvent) {
    event.preventDefault();
    run(() => controlApi.updateWorkshop(workshop.id, { name: name.trim(), network_id: networkId || null }));
  }
  return <section className="bento-panel p-6 space-y-5" aria-labelledby="control-workshop-title">
    <div>
      <h2 id="control-workshop-title" className="text-xl font-semibold wrap-break-word">{workshop.name}</h2>
      <p className="text-sm text-muted-foreground wrap-break-word">{[workshop.email, workshop.phone, workshop.timezone].filter(Boolean).join(' · ')}</p>
    </div>
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 items-end">
      <label className="space-y-1 text-sm"><span className="block">{t('control.name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
      <label className="space-y-1 text-sm"><span className="block">{t('control.network')}</span>
        <select value={networkId} onChange={(e) => setNetworkId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
          <option value="">{t('control.no_network')}</option>
          {networks.map((n) => <option key={n.id} value={n.id}>{n.name}{n.is_exclusive ? ` · ${t('control.exclusive')}` : ''}</option>)}
        </select></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={status.kind === 'saving' || !name.trim()}>{t('control.save')}</Button>
        <Button type="button" variant="secondary" disabled={status.kind === 'saving'}
          onClick={() => run(() => controlApi.updateWorkshop(workshop.id, { is_active: !workshop.is_active }))}>
          {t(workshop.is_active ? 'control.suspend' : 'control.activate')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground sm:col-span-2">{t('control.suspend_help')}</p>
      <div className="sm:col-span-2"><StatusLine status={status} /></div>
    </form>
    <StaffAccess centerId={workshop.id} onChanged={onChanged} />
  </section>;
}

function StaffAccess({ centerId, onChanged }: { centerId: string; onChanged: () => void }) {
  const { t } = useI18n();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const { status, run } = useSave(() => { setRevision((r) => r + 1); onChanged(); });
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    controlApi.staff(centerId, abort.signal).then(setStaff)
      .catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [centerId, revision]);
  return <div className="space-y-3">
    <h3 className="font-semibold">{t('control.staff')}</h3>
    {failed ? <p role="alert" className="text-sm text-destructive">{t('control.failed')} <Button variant="secondary" onClick={() => setRevision((r) => r + 1)}>{t('control.retry')}</Button></p>
      : staff === null ? <p role="status" className="text-sm">{t('control.loading')}</p>
      : staff.length === 0 ? <p className="text-sm text-muted-foreground">{t('control.staff_empty')}</p>
      : <ul className="control-staff">{staff.map((member) => <li key={member.id} data-inactive={!member.is_active || undefined}>
        <div className="min-w-0"><p className="font-medium wrap-break-word">{member.full_name}</p><p className="text-sm text-muted-foreground break-all">{member.email}</p></div>
        {member.is_super_admin ? <span className="control-badge">{t('control.platform_operator')}</span> : <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`role-${member.id}`}>{t('control.role')}</label>
          <select id={`role-${member.id}`} value={member.role} disabled={status.kind === 'saving'}
            onChange={(e) => run(() => controlApi.updateStaff(member.id, { role: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            {STAFF_ROLES.map((role) => <option key={role} value={role}>{t(`control.role.${role}`)}</option>)}
          </select>
          <Button variant="secondary" disabled={status.kind === 'saving'}
            onClick={() => run(() => controlApi.updateStaff(member.id, { is_active: !member.is_active }))}>
            {t(member.is_active ? 'control.disable' : 'control.enable')}
          </Button>
        </div>}
      </li>)}</ul>}
    <StatusLine status={status} />
  </div>;
}
