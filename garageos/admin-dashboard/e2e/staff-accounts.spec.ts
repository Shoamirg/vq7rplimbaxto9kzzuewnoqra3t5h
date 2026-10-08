import { expect, test } from '@playwright/test';

const owner = { email: 'admin@demo.garageos.app', password: 'demo1234' };
const password = 'Account-test-only-2026!';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8010/api/v1';

test.use({ trace: 'off' });

test('owner opens customer password access; customer credentials cannot enter staff panel', async ({ page }) => {
  expect((await page.request.post('/api/auth/login', { data: owner })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: 'garageos_locale', value: 'uz', url: 'http://localhost:3001' }]);
  const customer = await page.request.post('/api/proxy/customers', { data: { full_name: 'Browser Mijoz', phone: `998${Date.now().toString().slice(-9)}` } });
  expect(customer.status(), await customer.text()).toBe(201);
  const id = (await customer.json()).id;
  await page.goto(`/customers/${id}`);
  const form = page.getByRole('form', { name: 'Mijoz ilovasiga kirish' });
  await expect(form).toBeVisible();
  const email = `browser-customer-${Date.now()}@example.com`;
  await form.getByLabel('Kirish uchun email').fill(email);
  await form.getByLabel('Boshlang‘ich parol', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Mijoz loginini yaratish' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  const login = await page.request.post(`${apiUrl}/customer/auth/login`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const token = (await login.json()).access_token;
  expect((await page.request.get(`${apiUrl}/customer/history/vehicles`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
  expect((await page.request.post(`${apiUrl}/auth/login`, { data: { email, password } })).status()).toBe(401);
  await page.getByRole('button', { name: 'Parol bilan kirishni to‘xtatish' }).click();
  await expect(page.getByRole('button', { name: 'Parol bilan kirishni yoqish' })).toBeVisible();
  expect((await page.request.get(`${apiUrl}/customer/me`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
});

test('owner creates, edits, suspends and restores a real mechanic account', async ({ page }) => {
  expect((await page.request.post('/api/auth/login', { data: owner })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: 'garageos_locale', value: 'uz', url: 'http://localhost:3001' }]);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Xodim akkauntlari', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xodim qo‘shish' }).click();
  const form = page.getByRole('form', { name: 'Xodim qo‘shish' });
  const email = `browser-staff-${Date.now()}@example.com`;
  await form.getByLabel('To‘liq ism').fill('Browser Sherzod');
  await form.getByLabel('Kirish uchun email').fill(email);
  await form.getByLabel('Boshlang‘ich parol', { exact: true }).fill(password);
  const createdPromise = page.waitForResponse((res) => res.url().includes('/api/proxy/staff') && res.request().method() === 'POST');
  await form.getByRole('button', { name: 'Xodimni saqlash' }).click();
  const created = await createdPromise;
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).id;
  await expect(form).toBeHidden();
  await page.getByRole('searchbox').fill(email);
  const row = page.getByTestId(`staff-${id}`);
  await expect(row).toContainText('Browser Sherzod');
  await expect(row).toContainText('Usta');
  const login = await page.request.post(`${apiUrl}/auth/login`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const token = (await login.json()).access_token;
  await row.getByRole('button', { name: 'Xodimni tahrirlash' }).click();
  const edit = page.getByRole('form', { name: 'Xodimni tahrirlash' });
  await expect(edit.getByLabel('Kirish uchun email')).toBeDisabled();
  await expect(edit.getByLabel('Boshlang‘ich parol')).toHaveCount(0);
  await edit.getByLabel('To‘liq ism').fill('Browser Sherzod Usta');
  await edit.getByLabel('Akkaunt holati').selectOption('false');
  await edit.getByRole('button', { name: 'Xodimni saqlash' }).click();
  await expect(edit).toBeHidden();
  await expect(row).toContainText('Browser Sherzod Usta');
  await expect(row).toContainText('To‘xtatilgan');
  expect((await page.request.get(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  await row.getByRole('button', { name: 'Xodimni tahrirlash' }).click();
  await edit.getByLabel('Akkaunt holati').selectOption('true');
  await edit.getByRole('button', { name: 'Xodimni saqlash' }).click();
  await expect(edit).toBeHidden();
  await expect(row).toContainText('Faol');
  expect((await page.request.post(`${apiUrl}/auth/login`, { data: { email, password } })).status()).toBe(200);
});

for (const locale of ['uz', 'en', 'ru']) {
  for (const width of [390, 1280]) {
    test(`${locale} ${width}: account list and creation form render without horizontal overflow`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      expect((await page.request.post('/api/auth/login', { data: owner })).ok()).toBeTruthy();
      await page.context().addCookies([{ name: 'garageos_locale', value: locale, url: 'http://localhost:3001' }]);
      await page.goto('/settings');
      const add = { uz: 'Xodim qo‘shish', en: 'Add employee', ru: 'Добавить сотрудника' }[locale]!;
      const title = { uz: 'Xodim akkauntlari', en: 'Employee accounts', ru: 'Аккаунты сотрудников' }[locale]!;
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.locator('[data-testid^="staff-"]').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await page.screenshot({ path: testInfo.outputPath('accounts-list.png'), fullPage: true });
      await page.getByRole('button', { name: add, exact: true }).click();
      await expect(page.getByRole('form', { name: add })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await page.screenshot({ path: testInfo.outputPath('accounts-form.png'), fullPage: true });
    });
  }
}
