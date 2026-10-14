import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { prepareMini } from './support/mini-auth';

// Read-only fixtures; each test has independent cookies and browser storage.
test.describe.configure({ mode: 'parallel' });

const profiles = [
  { width: 320, locale: 'en', theme: 'light' },
  { width: 390, locale: 'ru', theme: 'dark' },
  { width: 768, locale: 'uz', theme: 'light' },
  { width: 1440, locale: 'en', theme: 'light' },
  { width: 1440, locale: 'en', theme: 'dark' },
] as const;

async function inspect(page: Page, name: string, output: (name: string) => string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0);
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`).toBe(true);
  await page.screenshot({ path: output(`${name}.png`), fullPage: true });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect.soft(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), name).toEqual([]);
}

for (const profile of profiles) {
  test.describe(`${profile.width} ${profile.locale} ${profile.theme}`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await page.setViewportSize({ width: profile.width, height: 960 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: profile.theme });
      await page.context().addCookies([{ name: 'garageos_locale', value: profile.locale, url: baseURL! }]);
      await page.addInitScript(theme => localStorage.setItem('garageos-theme', theme), profile.theme);
    });

    test('staff panels and vehicle inspection', async ({ page }, info) => {
      test.setTimeout(300_000);
      expect((await page.request.post('/api/auth/login', { data: { email: 'admin@demo.garageos.app', password: 'parol12345' } })).ok()).toBe(true);
      for (const path of ['/dashboard', '/calendar', '/appointments', '/customers', '/vehicles', '/billing', '/inbox', '/operations', '/reports', '/settings', '/inventory', '/support']) {
        await page.goto(path, { waitUntil: 'networkidle' });
        if (path === '/dashboard' && profile.width < 1024) {
          await page.getByTestId('sidebar-open').click();
          await expect(page.locator('#staff-sidebar')).toBeVisible();
          await expect(page.locator('#staff-sidebar nav a').first()).toHaveText(/\S/);
          await page.keyboard.press('Escape');
          await expect(page.locator('#staff-sidebar')).not.toBeVisible();
        }
        await inspect(page, path.slice(1), n => info.outputPath(n));
      }
      const vehicles = await (await page.request.get('/api/proxy/vehicles?limit=1')).json();
      const id = vehicles.items[0].id;
      await page.goto(`/vehicles/${id}`);
      await expect(page.locator('.vehicle-blueprint')).toBeVisible();
      const systems = page.getByTestId('vic-hotspot');
      if (await systems.count()) {
        await systems.first().focus();
        await page.keyboard.press('Enter');
        await expect(systems.first()).toHaveAttribute('aria-pressed', 'true');
      }
      await inspect(page, 'inspection', n => info.outputPath(n));
      await page.goto(`/passport/${id}`);
      await expect(page.locator('.pp-root .vehicle-blueprint')).toBeVisible();
      await inspect(page, 'public-passport', n => info.outputPath(n));
      const jobs = await (await page.request.get('/api/proxy/appointments?limit=1')).json();
      const job = (jobs.items ?? jobs)[0];
      if (job) {
        await page.goto(`/appointments/${job.id}`);
        await inspect(page, 'work-order', n => info.outputPath(n));
      }
    });

    test('customer Mini App and passport', async ({ page, baseURL }, info) => {
      test.setTimeout(150_000);
      await prepareMini(page, baseURL, profile.locale);
      const { design_conversation_id: conversationId } = JSON.parse(readFileSync(process.env.GARAGEOS_BROWSER_FIXTURE!, 'utf8'));
      expect(conversationId, 'Run python -m tests.support.design_browser after preparing the local browser fixture').toMatch(/^[a-f0-9-]{36}$/);
      for (const path of ['/mini', '/mini/vehicles', '/mini/billing', '/mini/book', '/mini/me', '/mini/messages', '/mini/roadside']) {
        await page.goto(path, { waitUntil: 'networkidle' });
        await inspect(page, path.replaceAll('/', '-'), n => info.outputPath(n));
      }
      await page.goto('/mini/messages');
      const conversation = page.locator(`a[href="/mini/messages/${conversationId}"]`);
      await expect(conversation).toBeVisible();
      await conversation.click();
      await expect(page.locator('h1')).toHaveText('Design QA inspection');
      await expect(page.getByText('Your inspection is ready.', { exact: true })).toBeVisible();
      await expect(page.getByText('Thank you. I will review the inspection.', { exact: true })).toBeVisible();
      await inspect(page, 'customer-conversation', n => info.outputPath(n));
      await page.goto('/mini/vehicles');
      const vehicle = page.locator('a[href^="/mini/vehicles/"]').first();
      await vehicle.click();
      await expect(page.locator('.vehicle-blueprint')).toBeVisible();
      await inspect(page, 'customer-vehicle', n => info.outputPath(n));
    });

    test('superadmin platform', async ({ page }, info) => {
      expect((await page.request.post('/api/auth/login', { data: { email: 'platform-browser@example.com', password: 'Platform-browser-only-2026!' } })).ok()).toBe(true);
      await page.goto('/platform');
      await expect(page.locator('.platform-records > li').first()).toBeVisible();
      await inspect(page, 'platform', n => info.outputPath(n));
    });

    test('marketing and login', async ({ page }, info) => {
      test.setTimeout(90_000);
      for (const path of ['/', '/pricing', '/login', '/demo']) {
        await page.goto(path, { waitUntil: 'networkidle' });
        await inspect(page, path.replaceAll('/', '-') || 'marketing', n => info.outputPath(n));
      }
    });
  });
}
