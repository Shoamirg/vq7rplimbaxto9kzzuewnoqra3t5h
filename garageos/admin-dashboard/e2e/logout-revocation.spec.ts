import { expect, test } from '@playwright/test';
import { logoutRequestAllowed, revokeServerSession, logoutFingerprintAllowed } from '../lib/server-logout';

test('logout rejects cross-site browser requests before authentication cleanup', () => {
  const url = 'https://garage.example/api/auth/logout';
  expect(logoutRequestAllowed(new Request(url, { headers: { Origin: 'https://evil.example' } }))).toBe(false);
  expect(logoutRequestAllowed(new Request(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))).toBe(false);
  expect(logoutRequestAllowed(new Request(url, { headers: { Origin: 'https://garage.example' } }))).toBe(true);
  expect(logoutRequestAllowed(new Request(url))).toBe(false);
});

test('logout derives the public origin from the private Caddy hop', () => {
  const headers = { Host: 'garageos.uz', 'X-Forwarded-Host': 'garageos.uz', 'X-Forwarded-Proto': 'https', Origin: 'https://garageos.uz' };
  expect(logoutRequestAllowed(new Request('http://dashboard:3000/api/auth/logout', { headers }))).toBe(true);
  expect(logoutRequestAllowed(new Request('http://dashboard:3000/api/auth/logout', { headers: { ...headers, Origin: 'https://untrusted.example' } }))).toBe(false);
  expect(logoutRequestAllowed(new Request('http://dashboard:3000/api/auth/logout', { headers: { ...headers, Origin: 'http://garageos.uz' } }))).toBe(false);
  expect(logoutRequestAllowed(new Request('http://localhost:3000/api/auth/logout', { headers: {
    Host: 'localhost:3000', 'X-Forwarded-Host': 'localhost:3000', 'X-Forwarded-Proto': 'http', Origin: 'http://localhost:3000',
  } }))).toBe(true);
});

test('logout does not trust a spoofed forwarded host over the Caddy-preserved Host', () => {
  const headers = { Host: 'garageos.uz', 'X-Forwarded-Host': 'untrusted.example', 'X-Forwarded-Proto': 'https', Origin: 'https://untrusted.example' };
  expect(logoutRequestAllowed(new Request('http://dashboard:3000/api/auth/logout', { headers }))).toBe(false);
  expect(logoutRequestAllowed(new Request('http://dashboard:3000/api/auth/logout', { headers: {
    'X-Forwarded-Host': 'garageos.uz', 'X-Forwarded-Proto': 'https', Origin: 'https://garageos.uz',
  } }))).toBe(false);
});

test('malformed or partial forwarded origin fails closed, including no-Origin callers', () => {
  const cases: Record<string, string>[] = [
    { 'X-Forwarded-Host': 'garageos.uz' },
    { 'X-Forwarded-Proto': 'https' },
    { 'X-Forwarded-Host': 'garageos.uz,evil.example', 'X-Forwarded-Proto': 'https' },
    { 'X-Forwarded-Host': 'garageos.uz', 'X-Forwarded-Proto': 'https,http' },
    { 'X-Forwarded-Host': 'garageos.uz', 'X-Forwarded-Proto': 'javascript' },
    { 'X-Forwarded-Host': 'garageos.uz/evil', 'X-Forwarded-Proto': 'https' },
    { 'X-Forwarded-Host': 'garageos.uz@evil.example', 'X-Forwarded-Proto': 'https' },
    { 'X-Forwarded-Host': 'garageos.uz#evil', 'X-Forwarded-Proto': 'https' },
  ];
  for (const extra of cases) expect(logoutRequestAllowed(new Request('http://dashboard:3000/api/auth/logout', { headers: { Host: 'garageos.uz', ...extra } }))).toBe(false);
});

test('server logout proves revocation only from an acknowledged backend response', async () => {
  const calls: RequestInit[] = [];
  const transport: typeof fetch = async (_url, init) => {
    calls.push(init!);
    return Response.json({ ok: true });
  };
  expect(await revokeServerSession('https://api.example/api/v1', 'qa-token', transport)).toBe('confirmed');
  expect(calls[0].headers).toEqual({ Authorization: 'Bearer qa-token' });
  expect(calls[0].redirect).toBe('error');
  expect(await revokeServerSession('https://api.example/api/v1', undefined, transport)).toBe('none');
  expect(calls.length).toBe(1);
});

test('offline, rejected and malformed backend logout never claim server revocation', async () => {
  for (const transport of [
    async () => { throw new Error('offline'); },
    async () => Response.json({ ok: false }, { status: 401 }),
    async () => new Response('invalid json'),
    async () => Response.json({}),
  ]) expect(await revokeServerSession('https://api.example/api/v1', 'qa-token', transport)).toBe('unconfirmed');
});

test('server render proof matches only the actual current cookie, while explicit legacy no-body logout remains supported', () => {
  const current = 'b'.repeat(64);
  expect(logoutFingerprintAllowed(current, current)).toBe(true);
  expect(logoutFingerprintAllowed('a'.repeat(64), current)).toBe(false);
  expect(logoutFingerprintAllowed(current, null)).toBe(false);
  expect(logoutFingerprintAllowed(null, current)).toBe(false);
  expect(logoutFingerprintAllowed({}, current)).toBe(false);
  expect(logoutFingerprintAllowed(undefined, current)).toBe(true);
});
