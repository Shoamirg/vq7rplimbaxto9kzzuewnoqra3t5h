// Direct route contract: real BFF handler, fake upstream transport; no service.
import { expect, test } from '@playwright/test';
import { POST } from '../app/api/auth/login/route';
import { POST as demoPOST } from '../app/api/demo/route';
import { POST as miniPOST } from '../app/api/mini/auth/route';

const originalFetch = globalThis.fetch;
const originalTrust = process.env.GARAGEOS_TRUST_CADDY_IP;
const originalMode = process.env.NODE_ENV;
test.beforeEach(() => { delete process.env.GARAGEOS_TRUST_CADDY_IP; });
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalTrust === undefined) delete process.env.GARAGEOS_TRUST_CADDY_IP;
  else process.env.GARAGEOS_TRUST_CADDY_IP = originalTrust;
  if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Object.assign(process.env, { NODE_ENV: originalMode });
});

function caddyLogin(ip?: string) {
  return new Request('http://dashboard:3000/api/auth/login', {
    method: 'POST', headers: {
      Host: 'garageos.uz', 'X-Forwarded-Host': 'garageos.uz', 'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.88, 198.51.100.99',
      ...(ip ? { 'X-Real-IP': ip } : {}),
    }, body: JSON.stringify({ email: 'qa-contract@example.com', password: 'qa-contract-only' }),
  });
}
function login() {
  return new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa-contract@example.com', password: 'qa-contract-only' }),
  });
}

test('BFF preserves upstream rate limiting and Retry-After instead of reporting an invalid password', async () => {
  globalThis.fetch = async () => Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'Retry-After': '17' } });
  const response = await POST(login());
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('17');
  expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' });
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('transient backend failure is unavailable rather than invalid credentials', async () => {
  globalThis.fetch = async () => Response.json({ internal: 'must not escape' }, { status: 503 });
  const response = await POST(login());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('network failure remains a sanitized transient response with no credential replay', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('private upstream connection failure'); };
  const response = await POST(login());
  expect(response.status).toBe(503); expect(calls).toBe(1);
  const body = await response.text();
  expect(body).toContain('BACKEND_UNAVAILABLE'); expect(body).not.toContain('private upstream');
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('malformed success cannot set authentication cookies or claim credentials are wrong', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ unexpected: true }); };
  const response = await POST(login());
  expect(response.status).toBe(502); expect(calls).toBe(1);
  expect(await response.json()).toMatchObject({ code: 'INVALID_BACKEND_RESPONSE' });
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('staff login and profile verification forward only canonical trusted Caddy IP', async () => {
  Object.assign(process.env, { NODE_ENV: 'production', GARAGEOS_TRUST_CADDY_IP: 'true' });
  let loginCalls = 0, profileCalls = 0;
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Real-IP')).toBe('2001:db8::1');
    expect(headers.has('X-Forwarded-For')).toBe(false); expect(headers.has('Forwarded')).toBe(false);
    expect(init?.redirect).toBe('error');
    if (String(url).endsWith('/auth/login')) {
      loginCalls++; return Response.json({ access_token: 'qa-opaque-access' });
    }
    profileCalls++; return Response.json({ id: 'qa-profile-id', platform_permissions: [] });
  };
  const response = await POST(caddyLogin('2001:0DB8:0:0:0:0:0:1'));
  expect(response.status).toBe(200); expect(loginCalls).toBe(1); expect(profileCalls).toBe(1);
  expect(await response.json()).toMatchObject({ ok: true, redirectTo: '/dashboard' });
});

test('missing canonical IP in opted-in production fails before credential dispatch', async () => {
  Object.assign(process.env, { NODE_ENV: 'production', GARAGEOS_TRUST_CADDY_IP: 'true' });
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({}); };
  const response = await POST(caddyLogin());
  expect(response.status).toBe(503); expect(calls).toBe(0);
  expect(await response.json()).toMatchObject({ code: 'TRUSTED_PROXY_UNAVAILABLE' });
  expect(response.headers.has('set-cookie')).toBe(false);
});

for (const status of [401, 403, 422, 500, 502]) test(`staff login preserves sanitized upstream status ${status}`, async () => {
  globalThis.fetch = async () => Response.json({ private: 'internal response must not escape' }, { status });
  const response = await POST(login());
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain('internal response');
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('profile outage after successful credential exchange cannot become invalid password or set cookies', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({ access_token: 'qa-opaque-access' }) : Response.json({}, { status: 503 });
  const response = await POST(login());
  expect(response.status).toBe(503); expect(calls).toBe(2);
  expect(await response.json()).toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('only the backend invalid-credentials contract claims the supplied password is wrong', async () => {
  globalThis.fetch = async () => Response.json({ error: { code: 'INVALID_CREDENTIALS', detail: 'private rejected-account information' } }, { status: 401 });
  const invalid = await POST(login());
  expect(invalid.status).toBe(401); expect(await invalid.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  globalThis.fetch = async () => new Response('<h1>Private upstream authorization gateway</h1>', { status: 401 });
  const gateway = await POST(login());
  expect(gateway.status).toBe(401); expect(await gateway.json()).toMatchObject({ code: 'ACCESS_UNAVAILABLE' });
  expect(gateway.headers.has('set-cookie')).toBe(false);
});

test('malformed profile after successful credential exchange remains invalid response', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({ access_token: 'qa-opaque-access' }) : Response.json({ platform_permissions: 'invalid' });
  const response = await POST(login());
  expect(response.status).toBe(502); expect(calls).toBe(2);
  expect(response.headers.has('set-cookie')).toBe(false);
});

for (const [name, handler] of [['demo', demoPOST], ['mini', miniPOST]] as const) test(`${name} authentication shares canonical IP and truthful 429 contract`, async () => {
  Object.assign(process.env, { NODE_ENV: 'production', GARAGEOS_TRUST_CADDY_IP: 'true' });
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    expect(new Headers(init?.headers).get('X-Real-IP')).toBe('203.0.113.19');
    return Response.json({ private: 'must not escape' }, { status: 429, headers: { 'Retry-After': '19' } });
  };
  const response = await handler(caddyLogin('203.0.113.19'));
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('19');
  expect(calls).toBe(1); expect(response.headers.has('set-cookie')).toBe(false);
  expect(await response.text()).not.toContain('must not escape');
});
