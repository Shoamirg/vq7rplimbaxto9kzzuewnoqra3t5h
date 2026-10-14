'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { staffAuthTransition, AuthTransitionUnavailable } from '@/lib/auth-transition';
import { useI18n } from '@/lib/i18n/context';

export function DemoEntryButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enter() {
    setBusy(true); setError(null);
    try {
      await staffAuthTransition(async (current, _marker, complete) => {
        const response = await fetch('/api/demo', { method: 'POST' });
        const data = await response.json().catch(() => null);
        if (!current()) return;
        if (!response.ok || data?.ok !== true) { setError('platform.demo_unavailable'); return; }
        complete();
        router.replace('/dashboard'); router.refresh();
      });
    } catch (error) {
      setError(error instanceof AuthTransitionUnavailable ? 'platform.auth_coordination_unavailable' : 'platform.demo_unavailable');
    } finally { setBusy(false); }
  }
  return <div>
    <button type="button" disabled={busy} aria-busy={busy} onClick={enter} className="mkt-btn mkt-btn--primary mkt-btn--lg">
      {t('platform.enter_demo')} <ArrowRight size={17} />
    </button>
    {error && <p role="alert" className="mt-4 text-sm">{t(error)}</p>}
  </div>;
}
