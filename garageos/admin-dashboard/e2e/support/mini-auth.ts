import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Use genuine verified launch data against production BFF/backend auth. */
export async function prepareMini(page: Page, baseURL: string | undefined, locale: 'en' | 'ru' = 'en') {
  let fixture: { qa_only: boolean; base_origin: string; init_data: string; customer_id: string };
  try {
    const file = process.env.GARAGEOS_BROWSER_FIXTURE;
    if (!file || !baseURL) throw new Error();
    fixture = JSON.parse(readFileSync(file, 'utf8'));
    const origin = new URL(baseURL);
    if (!fixture.qa_only || fixture.base_origin !== origin.origin
        || origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)
        || typeof fixture.init_data !== 'string' || !fixture.init_data || !fixture.customer_id) throw new Error();
  } catch {
    throw new Error('Prepare the private isolated browser fixture; see docs/agents/local-jenkins.md.');
  }
  await page.context().addCookies([{ name:'garageos_locale', value:locale, url:baseURL! }]);
  // The existing Mini client reauthenticates from Telegram on every page load.
  // Stub only the browser SDK's launch data, never API responses or tokens.
  await page.route('https://telegram.org/js/telegram-web-app.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.Telegram = { WebApp: { initData: ${JSON.stringify(fixture.init_data)} } };`,
    });
  });
  const auth = await page.request.post('/api/mini/auth', { data:{ init_data:fixture.init_data } });
  expect(auth.ok(), 'Synthetic signed launch must pass production BFF authentication').toBeTruthy();
  expect((await auth.json()).customer.id).toBe(fixture.customer_id);
}
