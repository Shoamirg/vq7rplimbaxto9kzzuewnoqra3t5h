import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, getCurrentUser, renderedAuthFingerprint } from '@/lib/api/server';
import { I18nProvider } from '@/lib/i18n/context';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/dictionaries';
import { PlatformWorkspace } from '@/components/platform/workspace';

export const dynamic = 'force-dynamic';

export default async function PlatformPage() {
  let user;
  try { user = await getCurrentUser(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/login?reauth=1');
    throw error;
  }
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return <I18nProvider initialLocale={isLocale(cookie) ? cookie : 'uz'}>
    <PlatformWorkspace name={user.full_name} authFingerprint={await renderedAuthFingerprint()} allowed={user.platform_permissions?.includes('platform.read') ?? false} />
  </I18nProvider>;
}
