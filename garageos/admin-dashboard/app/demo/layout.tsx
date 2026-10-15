import { cookies } from 'next/headers';
import { I18nProvider } from '@/lib/i18n/context';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/dictionaries';

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  return <I18nProvider initialLocale={isLocale(locale) ? locale : 'uz'}>{children}</I18nProvider>;
}
