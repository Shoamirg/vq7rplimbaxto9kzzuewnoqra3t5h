import { expect, test } from '@playwright/test';
import { translate, type Locale } from '../lib/i18n/dictionaries';
import { assertAccessible } from './support/accessibility';

for (const locale of ['uz', 'en', 'ru'] as Locale[]) {
  for (const theme of ['light', 'dark'] as const) test(`login failure ${locale} ${theme} fits a short phone`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width: theme === 'dark' ? 360 : 390, height: 540 });
    await page.emulateMedia({ colorScheme: theme });
    await page.context().addCookies([{ name: 'garageos_locale', value: locale, url: baseURL! }]);
    await page.route('**/api/auth/login', route => route.fulfill({ status: 503,
      contentType: 'application/json', body: JSON.stringify({ code: 'BACKEND_UNAVAILABLE' }) }));
    await page.goto('/login');
    await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
    await page.getByRole('button', { name: /^(Sign in|Kirish|Войти)$/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: translate(locale, 'platform.login_unavailable') })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await assertAccessible(page, info, `login-feedback-phone-${locale}-${theme}`);
    await page.screenshot({ path: info.outputPath('login-feedback-phone.png'), fullPage: true });
  });

  test(`login 429 ${locale} honors Retry-After with deliberate retry only`, async ({ page, baseURL }, info) => {
    await page.context().addCookies([{ name: 'garageos_locale', value: locale, url: baseURL! }]);
    await page.clock.install();
    let posts = 0;
    await page.route('**/api/auth/login', route => {
      posts++;
      return route.fulfill({ status: 429, headers: { 'Retry-After': '3' }, contentType: 'application/json', body: JSON.stringify({ code: 'RATE_LIMITED', error: 'private upstream response must not display' }) });
    });
    await page.goto('/login');
    const submit = page.getByRole('button', { name: /^(Sign in|Kirish|Войти)$/ });
    await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: translate(locale, 'platform.login_rate_limited_wait', { seconds: 3 }) })).toBeVisible();
    await expect(submit).toBeDisabled(); expect(posts).toBe(1);
    await page.getByLabel(/^(Password|Parol|Пароль)$/).press('Enter');
    expect(posts).toBe(1);
    await page.clock.fastForward(4000);
    await expect(submit).toBeEnabled(); expect(posts).toBe(1);
    await expect(page.getByRole('alert').filter({ hasText: translate(locale, 'platform.login_rate_limited') })).toBeVisible();
    await expect(page.getByText('private upstream response must not display', { exact: true })).toHaveCount(0);
    await assertAccessible(page, info, `login-rate-limit-${locale}`);
    await submit.click(); await expect.poll(() => posts).toBe(2);
  });

  for (const failure of [
    { status: 503, code: 'BACKEND_UNAVAILABLE', key: 'platform.login_unavailable' },
    { status: 503, code: 'TRUSTED_PROXY_UNAVAILABLE', key: 'platform.login_unavailable' },
    { status: 502, code: 'INVALID_BACKEND_RESPONSE', key: 'platform.login_invalid_response' },
  ]) test(`login ${failure.code} ${locale} is actionable without invalid-password claims or replay`, async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'garageos_locale', value: locale, url: baseURL! }]);
    let posts = 0;
    await page.route('**/api/auth/login', route => {
      posts++;
      return route.fulfill({ status: failure.status, contentType: 'application/json', body: JSON.stringify({ code: failure.code, error: 'private upstream response must not display' }) });
    });
    await page.goto('/login');
    await page.getByRole('button', { name: /^(Sign in|Kirish|Войти)$/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: translate(locale, failure.key) })).toBeVisible();
    await expect(page.getByText(translate(locale, 'platform.login_credentials'), { exact: true })).toHaveCount(0);
    await expect(page.getByText('private upstream response must not display', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Sign in|Kirish|Войти)$/ })).toBeEnabled();
    await page.getByLabel(/^(Email|Эл. почта)$/).fill('changed-by-user@example.com');
    expect(posts).toBe(1); await expect(page).toHaveURL(/\/login$/);
  });

  test(`login transport loss ${locale} asks for manual recovery and never replays`, async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'garageos_locale', value: locale, url: baseURL! }]);
    let posts = 0;
    await page.route('**/api/auth/login', route => { posts++; return route.abort('failed'); });
    await page.goto('/login');
    await page.getByRole('button', { name: /^(Sign in|Kirish|Войти)$/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: translate(locale, 'platform.login_connection') })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Sign in|Kirish|Войти)$/ })).toBeEnabled();
    expect(posts).toBe(1);
  });
}
