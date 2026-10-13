import { expect, test } from '@playwright/test';
import { queueLogin, queueProfiles } from './support/queue';
import { translate, type Locale } from '../lib/i18n/dictionaries';
import { assertAccessible } from './support/accessibility';

test('cross-site logout cannot clear a signed-in staff browser', async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, 'en', 390);
  const response = await page.request.post('/api/auth/logout', { headers: { Origin: 'https://untrusted.example' } });
  expect(response.status()).toBe(403);
  expect((await page.request.get('/api/proxy/auth/me')).ok()).toBeTruthy();
});

test('login and demo cookie changes reject cross-site requests; legacy demo GET is harmless', async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, 'en', 390);
  const before = await (await page.request.get('/api/proxy/auth/me')).json();
  for (const path of ['/api/auth/login', '/api/demo']) {
    expect((await page.request.post(path, { headers: { Origin: 'https://untrusted.example' } })).status()).toBe(403);
  }
  const legacy = await page.request.get('/api/demo', { maxRedirects: 0 });
  expect(legacy.status()).toBe(307);
  expect(legacy.headers()['location']).toMatch(/\/demo$/);
  expect(legacy.headers()['set-cookie']).toBeUndefined();
  expect((await (await page.request.get('/api/proxy/auth/me')).json()).id).toBe(before.id);
});

test('BFF stale render proof has no revocation or cookie-reset effects; explicit no-body cleanup remains compatible', async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, 'en', 390);
  const before = await (await page.request.get('/api/proxy/auth/me')).json();
  const denied = await page.request.post('/api/auth/logout', { data: { expected_fingerprint: '0'.repeat(64) } });
  expect(denied.status()).toBe(409);
  expect(denied.headers()['set-cookie']).toBeUndefined();
  const current = await page.request.get('/api/proxy/auth/me');
  expect(current.ok()).toBeTruthy(); expect((await current.json()).id).toBe(before.id);
  expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
  expect((await page.request.get('/api/proxy/auth/me')).status()).toBe(401);
});

for (const locale of ['uz', 'en', 'ru'] as Locale[]) test(`local logout with unconfirmed server revocation opens a usable localized login ${locale}`, async ({ page, baseURL }, info) => {
  await queueLogin(page, baseURL!, locale, 360);
  await page.goto('/dashboard');
  // Exercise real BFF cookie/reset cleanup with an unconfirmed revocation
  // response. The transport classifier is covered without a live backend.
  await page.route('**/api/auth/logout', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ok: true, revocation: 'unconfirmed' } });
  }, { times: 1 });
  await page.getByRole('button', { name: translate(locale, 'menu.user'), exact: true }).click();
  await page.getByRole('menuitem', { name: translate(locale, 'menu.signout'), exact: true }).click();
  await expect(page).toHaveURL(/\/login\?logout=unconfirmed&auth_epoch=[0-9a-f-]+$/);
  await expect(page.getByRole('alert').filter({ hasText: translate(locale, 'platform.logout_unconfirmed') })).toHaveText(translate(locale, 'platform.logout_unconfirmed'));
  await expect(page.getByLabel('Email', { exact: true })).toBeEditable();
  expect((await page.request.get('/api/proxy/auth/me')).status()).toBe(401);
  await assertAccessible(page, info, `logout-unconfirmed-${locale}`);
  await page.screenshot({ path: info.outputPath(`logout-unconfirmed-${locale}-360.png`), fullPage: true });
});

test('held old logout and actual login in another tab preserve the newer staff identity', async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, 'en', 390);
  await page.goto('/dashboard');
  const other = await page.context().newPage();
  const owner = queueProfiles(baseURL!).owners[1];
  await other.goto('/login?reauth=1');
  await other.getByLabel('Email', { exact: true }).fill(owner.email);
  await other.getByLabel('Password', { exact: true }).fill(owner.password);
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(resolve => release = resolve), received = new Promise<void>(resolve => seen = resolve);
  let loginRequests = 0;
  other.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/login') loginRequests++; });
  await page.route('**/api/auth/logout', async route => {
    seen(); await held;
    const response = await route.fetch(); await route.fulfill({ response, json: { ok: true, revocation: 'unconfirmed' } });
  }, { times: 1 });
  try {
    await page.getByRole('button', { name: 'User menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
    await received;
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect.poll(() => other.evaluate(async () => (await navigator.locks.query()).pending?.some(lock => lock.name === 'garageos.staff-auth-transition.v1') ?? false)).toBe(true);
    expect(loginRequests).toBe(0);
    release();
    await expect(other).toHaveURL(/\/dashboard$/);
    const current = await other.request.get('/api/proxy/auth/me');
    expect(current.ok()).toBeTruthy();
    expect((await current.json()).email).toBe(owner.email);
    await page.unrouteAll({ behavior: 'wait' });
    expect(loginRequests).toBe(1);
    expect((await other.request.get('/api/proxy/auth/me')).ok()).toBeTruthy();
    await expect(other.getByText(translate('en', 'platform.logout_unconfirmed'), { exact: true })).toHaveCount(0);
    await expect(page.getByText(translate('en', 'platform.logout_unconfirmed'), { exact: true })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await other.close(); }
});

test('old staff tab cannot queue logout behind a held new UI login in another tab', async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, 'en', 390);
  await page.goto('/dashboard');
  const other = await page.context().newPage();
  const owner = queueProfiles(baseURL!).owners[1];
  await other.goto('/login?reauth=1');
  await other.getByLabel('Email', { exact: true }).fill(owner.email);
  await other.getByLabel('Password', { exact: true }).fill(owner.password);
  let release!: () => void, seen!: () => void, logouts = 0;
  const held = new Promise<void>(resolve => release = resolve), received = new Promise<void>(resolve => seen = resolve);
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/logout') logouts++; });
  await other.route('**/api/auth/login', async route => { seen(); await held; const response = await route.fetch(); await route.fulfill({ response }); }, { times: 1 });
  try {
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await received;
    await page.getByRole('button', { name: 'User menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: translate('en', 'platform.auth_transition_busy') })).toBeVisible();
    expect(logouts).toBe(0);
    release();
    await expect(other).toHaveURL(/\/dashboard$/);
    expect((await (await other.request.get('/api/proxy/auth/me')).json()).email).toBe(owner.email);
    // The old profile remains stale after the competing login completes.
    await page.getByRole('button', { name: 'User menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: translate('en', 'platform.auth_transition_stale') })).toBeVisible();
    expect(logouts).toBe(0);
    expect((await (await other.request.get('/api/proxy/auth/me')).json()).email).toBe(owner.email);
  } finally { release(); await other.unrouteAll({ behavior: 'wait' }); await other.close(); }
});

for (const ownerIndex of [0, 1]) test(`delayed authenticated SSR cannot own a newer login session ${ownerIndex === 0 ? 'same principal' : 'different principal'}`, async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, 'en', 1280);
  const rendered = await (await page.request.get('/api/proxy/auth/me')).json();
  const other = await page.context().newPage();
  const owner = queueProfiles(baseURL!).owners[ownerIndex];
  await other.goto('/login?reauth=1');
  await other.getByLabel('Email', { exact: true }).fill(owner.email);
  await other.getByLabel('Password', { exact: true }).fill(owner.password);
  let release!: () => void, seen!: () => void, logouts = 0;
  const held = new Promise<void>(resolve => release = resolve), received = new Promise<void>(resolve => seen = resolve);
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/logout') logouts++; });
  await page.route('**/dashboard', async route => {
    // Fetch the real authenticated document under A, then hold delivery while
    // another tab replaces its shared cookie. No fabricated profile payload.
    const response = await route.fetch(); seen(); await held;
    await route.fulfill({ response });
  }, { times: 1 });
  const navigation = page.goto('/dashboard');
  try {
    await received;
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(other).toHaveURL(/\/dashboard$/);
    const newer = await (await other.request.get('/api/proxy/auth/me')).json();
    expect(newer.email).toBe(owner.email);
    release(); await navigation;
    const menu = page.getByRole('button', { name: 'User menu', exact: true });
    await expect(menu).toContainText(rendered.full_name);
    const receiptKey = 'garageos.message-intents.v1:protected-stale-render-receipt';
    await page.evaluate(key => sessionStorage.setItem(key, 'protected receipt retained'), receiptKey);
    const ledgerBefore = await other.evaluate(() => localStorage.getItem('garageos.staff-auth-generation.v1'));
    await menu.click();
    await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: translate('en', 'platform.auth_transition_stale') })).toBeVisible();
    expect(logouts).toBe(0);
    expect(await page.evaluate(key => sessionStorage.getItem(key), receiptKey)).toBe('protected receipt retained');
    expect(await other.evaluate(() => localStorage.getItem('garageos.staff-auth-generation.v1'))).toBe(ledgerBefore);
    const current = await other.request.get('/api/proxy/auth/me');
    expect(current.ok()).toBeTruthy(); expect((await current.json()).id).toBe(newer.id);
  } finally { release(); await navigation.catch(() => {}); await page.unrouteAll({ behavior: 'wait' }); await other.close(); }
});

test('unavailable browser coordination blocks login and demo before cookie mutation', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  let authRequests = 0;
  page.on('request', request => { if (request.method() === 'POST' && ['/api/auth/login', '/api/demo'].includes(new URL(request.url()).pathname)) authRequests++; });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Web Locks' })).toContainText('Web Locks');
  await page.goto('/demo');
  await page.getByRole('button', { name: /Enter the live demo|Jonli demoni ochish/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Web Locks' })).toContainText('Web Locks');
  expect(authRequests).toBe(0);
});
