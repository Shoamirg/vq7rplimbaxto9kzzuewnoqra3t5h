import { expect, test } from '@playwright/test';

const operator = { email: 'platform-browser@example.com', password: 'Platform-browser-only-2026!' };
const labels = {
  uz: { title: 'Platforma holati', records: 'Yozuvlar', search: 'Yozuvlarni qidirish', apply: 'Filtrni qo‘llash', all: 'Barcha avtoservislar', center: 'Avtoservisni ko‘rish', empty: 'Yozuv topilmadi.', logout: 'Chiqish' },
  en: { title: 'Platform overview', records: 'Records', search: 'Search records', apply: 'Apply filters', all: 'All garages', center: 'View this garage', empty: 'No records found.', logout: 'Sign out' },
  ru: { title: 'Обзор платформы', records: 'Записи', search: 'Поиск записей', apply: 'Применить фильтры', all: 'Все сервисы', center: 'Открыть этот сервис', empty: 'Записи не найдены.', logout: 'Выйти' },
};

for (const width of [390, 1280]) {
  for (const locale of ['uz', 'en', 'ru'] as const) {
    test(`${locale} ${width}: global operator selects another garage and reads records`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.context().addCookies([{ name: 'garageos_locale', value: locale, url: process.env.BASE_URL ?? 'http://localhost:3001' }]);
      const signed = await page.request.post('/api/auth/login', { data: operator });
      expect(signed.ok()).toBeTruthy();
      expect((await signed.json()).redirectTo).toBe('/platform');
      await page.goto('/');
      await expect(page).toHaveURL(/\/platform$/);
      const text = labels[locale];
      await expect(page.getByRole('heading', { level: 1, name: text.title })).toBeVisible();
      const other = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name: 'Northside Auto (Tenant B)' }) });
      await expect(other).toBeVisible();
      await other.locator('summary').click();
      await expect(other.locator('dd').first()).toHaveText(/[a-f0-9]{8}-[a-f0-9-]{27}/);
      await page.screenshot({ path: `test-results/platform-${locale}-${width}-garages.png`, fullPage: true });
      await other.getByRole('button', { name: text.center }).click();
      await expect(page.getByRole('button', { name: text.all })).toBeVisible();
      await page.getByLabel(text.records, { exact: true }).selectOption('customers');
      await expect(page.getByRole('listitem').first()).toBeVisible();
      await expect(page.getByRole('listitem').first()).toContainText('Northside Auto (Tenant B)');
      await page.getByLabel(text.search, { exact: true }).fill('No-match-platform-938231');
      await page.getByRole('button', { name: text.apply, exact: true }).click();
      await expect(page.getByText(text.empty, { exact: false })).toBeVisible();
      await page.getByLabel(text.search, { exact: true }).fill('');
      await page.getByRole('button', { name: text.apply, exact: true }).click();
      await expect(page.getByRole('listitem').first()).toBeVisible();
      await page.screenshot({ path: `test-results/platform-${locale}-${width}-customers.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await page.getByRole('button', { name: text.logout, exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
    });
  }
}

test('ordinary owner has no global browser access or global proxy data', async ({ page }) => {
  expect((await page.request.post('/api/auth/login', { data: { email: 'admin@demo.garageos.app', password: 'demo1234' } })).ok()).toBeTruthy();
  expect((await page.request.get('/api/proxy/platform/records/centers')).status()).toBe(403);
  await page.goto('/platform');
  await expect(page.getByRole('alert')).toContainText('platforma ko‘rish huquqi');
  await expect(page.getByRole('listitem')).toHaveCount(0);
});


test('server-rejected stale session reaches login without a redirect loop', async ({ page }) => {
  await page.context().addCookies([{ name: 'garageos_token', value: 'invalid-expired-session', url: process.env.BASE_URL ?? 'http://localhost:3001' }]);
  await page.goto('/platform');
  await expect(page).toHaveURL(/\/login\?reauth=1$/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});
