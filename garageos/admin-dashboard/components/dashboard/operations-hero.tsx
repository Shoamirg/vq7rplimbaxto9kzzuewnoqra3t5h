'use client';

import Link from 'next/link';
import { Calendar, Car, Inbox, Receipt, ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { VehicleSchematic } from '@/components/vehicles/vehicle-telemetry-blueprint';
import type { Appointment } from '@/lib/api/types';

export function OperationsHero({ appointment }: { appointment?: Appointment }) {
  const { t } = useI18n();
  return <div className="operations-hero">
    <section className="operations-stage">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="telemetry-label">GarageOS / {t('nav.operations')}</p>
        {appointment && <span className="rounded-full bg-card px-3 py-1 text-xs font-medium">{t(`status.${appointment.status}`)}</span>}
      </div>
      <h2 className="mt-5 font-semibold">{appointment?.vehicle_summary || t('dash.today.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{appointment ? [appointment.customer_name, appointment.appointment_time, appointment.service_type].filter(Boolean).join(' · ') : t('dash.today.sub')}</p>
      <VehicleSchematic />
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground" href={appointment ? `/appointments/${appointment.id}` : '/appointments'}>
        {t('nav.appointments')} <ArrowUpRight className="size-4"/>
      </Link>
    </section>
    <aside className="glass-panel operations-shortcuts">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{t('nav.inbox')}</h2><Inbox className="size-5"/></div>
      <nav aria-label={t('section.workspace')}>
        {[{href:'/calendar',label:'nav.calendar',Icon:Calendar},{href:'/vehicles',label:'nav.vehicles',Icon:Car},{href:'/billing',label:'nav.billing',Icon:Receipt},{href:'/inbox',label:'nav.inbox',Icon:Inbox}].map(({href,label,Icon})=><Link key={href} href={href}><Icon aria-hidden="true"/>{t(label)}</Link>)}
      </nav>
      <Link href="/inbox" className="flex min-h-12 items-center justify-between rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">{t('nav.inbox')}<ArrowUpRight className="size-4"/></Link>
    </aside>
  </div>;
}
