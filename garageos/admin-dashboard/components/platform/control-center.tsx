'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@garageos/design-system';
import { ClientApiError } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/context';
import { controlApi, findWorkshop, type PlatformTree, type Selection } from '@/lib/platform/control-api';
import { ControlTree } from './control-tree';
import { NetworkDetail, WorkshopDetail } from './control-detail';
import { ControlLogs } from './control-logs';
import { NewNetworkForm, NewWorkshopForm } from './control-forms';

type Creating = 'network' | 'workshop' | null;

/** Platform → Network → Workshop tree with per-node controls and the activity log. */
export function ControlCenter({ onDenied }: { onDenied: () => void }) {
  const { t } = useI18n();
  const [tree, setTree] = useState<PlatformTree | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [creating, setCreating] = useState<Creating>(null);
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    controlApi.tree(abort.signal).then(setTree).catch((err) => {
      if (abort.signal.aborted) return;
      if (err instanceof ClientApiError && [401, 403].includes(err.status)) onDenied();
      else setFailed(true);
    });
    return () => abort.abort();
  }, [revision, onDenied]);
  const refresh = () => setRevision((r) => r + 1);
  if (failed) return <p role="alert" className="text-destructive">{t('control.failed')} <Button variant="secondary" onClick={refresh}>{t('control.retry')}</Button></p>;
  if (!tree) return <p role="status">{t('control.loading')}</p>;

  const network = selection?.kind === 'network' ? tree.networks.find((n) => n.id === selection.id) : undefined;
  const workshop = selection?.kind === 'workshop' ? findWorkshop(tree, selection.id) : undefined;
  const scopeLabel = network?.name ?? workshop?.name ?? t('control.logs_scope_all');
  function finishCreate(kind: 'network' | 'workshop', id: string | null) {
    setCreating(null);
    if (id) { setSelection({ kind, id }); refresh(); }
  }
  const detail = creating === 'network' ? <NewNetworkForm onDone={(id) => finishCreate('network', id)} />
    : creating === 'workshop' ? <NewWorkshopForm tree={tree} defaultNetworkId={network?.id ?? workshop?.network_id ?? null} onDone={(id) => finishCreate('workshop', id)} />
    : network ? <NetworkDetail key={network.id} network={network} onChanged={refresh} />
    : workshop ? <WorkshopDetail key={workshop.id} workshop={workshop} tree={tree} onChanged={refresh} />
    : <p className="bento-panel p-6 text-muted-foreground">{t('control.select_hint')}</p>;

  return <div className="control-center">
    <aside className="bento-panel p-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setCreating('network')}><Plus size={16} aria-hidden />{t('control.new_network')}</Button>
        <Button variant="secondary" onClick={() => setCreating('workshop')}><Plus size={16} aria-hidden />{t('control.new_workshop')}</Button>
      </div>
      <ControlTree tree={tree} selection={selection} onSelect={(next) => { setCreating(null); setSelection(next); }} />
    </aside>
    <div className="space-y-6 min-w-0">
      {detail}
      <ControlLogs key={selection ? `${selection.kind}:${selection.id}:${revision}` : `all:${revision}`} selection={selection} scopeLabel={scopeLabel} />
    </div>
  </div>;
}
