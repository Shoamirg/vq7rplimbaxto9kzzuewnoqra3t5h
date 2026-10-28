'use client';

import { Building2, Lock, Network as NetworkIcon, Unlock } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import type { NetworkNode, PlatformTree, Selection, WorkshopNode } from '@/lib/platform/control-api';

interface ControlTreeProps {
  tree: PlatformTree;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

export function ControlTree({ tree, selection, onSelect }: ControlTreeProps) {
  const { t } = useI18n();
  return <nav aria-label={t('control.title')} className="control-tree">
    <p className="control-tree-root"><Building2 size={16} aria-hidden />{t('control.platform')}</p>
    <ul role="tree">
      {tree.networks.map((network) => <NetworkBranch key={network.id} network={network} selection={selection} onSelect={onSelect} />)}
      <li role="treeitem" aria-expanded="true" aria-selected={false}>
        <p className="control-tree-group">{t('control.independent')}</p>
        <WorkshopList workshops={tree.independent} selection={selection} onSelect={onSelect} />
      </li>
    </ul>
  </nav>;
}

function NetworkBranch({ network, selection, onSelect }: { network: NetworkNode } & Omit<ControlTreeProps, 'tree'>) {
  const { t } = useI18n();
  const selected = selection?.kind === 'network' && selection.id === network.id;
  const Badge = network.is_exclusive ? Lock : Unlock;
  return <li role="treeitem" aria-expanded="true" aria-selected={selected}>
    <button type="button" className="control-node control-node-network" aria-pressed={selected}
      data-inactive={!network.is_active || undefined} onClick={() => onSelect({ kind: 'network', id: network.id })}>
      <NetworkIcon size={16} aria-hidden />
      <span className="control-node-name">{network.name}</span>
      <span className="control-badge" data-tone={network.is_exclusive ? 'exclusive' : 'open'}>
        <Badge size={12} aria-hidden />{t(network.is_exclusive ? 'control.exclusive' : 'control.open')}
      </span>
      {!network.is_active && <span className="control-badge">{t('control.archived')}</span>}
    </button>
    {network.workshops.length === 0
      ? <p className="control-tree-empty">{t('control.empty_network')}</p>
      : <WorkshopList workshops={network.workshops} selection={selection} onSelect={onSelect} />}
  </li>;
}

function WorkshopList({ workshops, selection, onSelect }: { workshops: WorkshopNode[] } & Omit<ControlTreeProps, 'tree'>) {
  const { t } = useI18n();
  return <ul role="group">
    {workshops.map((workshop) => {
      const selected = selection?.kind === 'workshop' && selection.id === workshop.id;
      return <li key={workshop.id} role="treeitem" aria-selected={selected}>
        <button type="button" className="control-node" aria-pressed={selected} data-inactive={!workshop.is_active || undefined}
          onClick={() => onSelect({ kind: 'workshop', id: workshop.id })}>
          <span className="control-node-name">{workshop.name}</span>
          {!workshop.is_active && <span className="control-badge">{t('control.suspended')}</span>}
          <span className="control-node-meta">{t('control.counts', { staff: workshop.staff_count, customers: workshop.customer_count })}</span>
        </button>
      </li>;
    })}
  </ul>;
}
