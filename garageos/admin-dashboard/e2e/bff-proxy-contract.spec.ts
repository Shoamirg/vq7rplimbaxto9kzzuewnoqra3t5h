import { expect, test } from '@playwright/test';
import { BffUnavailable, canonicalClientIpHeaders, backendRequest, proxyResponseHeaders } from '../lib/server-bff';
import { validatedRetryAfter, retryAfterSeconds, loginFailureKey } from '../lib/login-feedback';
import { sameOriginMutationAllowed } from '../lib/server-logout';

const trusted = { nodeEnv: 'production' as const, trustCaddyIp: 'true' };
function request(ip: string, extra: Record<string, string> = {}) {
  return new Request('http://dashboard:3000/api/proxy/conversations', { headers: {
    Host: 'garageos.uz', 'X-Forwarded-Host': 'garageos.uz', 'X-Forwarded-Proto': 'https', 'X-Real-IP': ip,
    'X-Forwarded-For': '198.51.100.20, 198.51.100.21', ...extra,
  } });
}

test('only explicitly trusted production uses the canonical single client address', () => {
  expect(canonicalClientIpHeaders(request('203.0.113.4'), trusted)).toEqual({ 'X-Real-IP': '203.0.113.4' });
  expect(canonicalClientIpHeaders(request('2001:0DB8:0:0:0:0:0:1'), trusted)).toEqual({ 'X-Real-IP': '2001:db8::1' });
  expect(canonicalClientIpHeaders(request('203.0.113.4'), { nodeEnv: 'development', trustCaddyIp: 'true' })).toEqual({});
  expect(canonicalClientIpHeaders(request('203.0.113.4'), { nodeEnv: 'production', trustCaddyIp: undefined })).toEqual({});
});

test('cookie-authenticated mutations require the exact public origin', () => {
  expect(sameOriginMutationAllowed(request('203.0.113.4', { Origin: 'https://garageos.uz' }))).toBe(true);
  expect(sameOriginMutationAllowed(request('203.0.113.4', { Origin: 'https://attacker.example' }))).toBe(false);
  expect(sameOriginMutationAllowed(request('203.0.113.4'))).toBe(false);
  expect(sameOriginMutationAllowed(request('203.0.113.4', {
    Origin: 'https://garageos.uz', 'Sec-Fetch-Site': 'cross-site',
  }))).toBe(false);
});

test('an invalid or absent canonical hop never falls back to spoofed XFF', () => {
  for (const ip of ['', '203.0.113.1,203.0.113.2', 'localhost', '127.000.000.1', '1.2.3.4:80', '[::1]', 'fe80::1%eth0', '1.2.3.4/32']) {
    expect(() => canonicalClientIpHeaders(request(ip), trusted)).toThrow(BffUnavailable);
  }
  expect(() => canonicalClientIpHeaders(request('203.0.113.1', { 'X-Forwarded-Host': 'evil.example' }), trusted)).toThrow(BffUnavailable);
  expect(() => canonicalClientIpHeaders(request('203.0.113.1', { 'X-Forwarded-Proto': 'https,http' }), trusted)).toThrow(BffUnavailable);
  expect(() => canonicalClientIpHeaders(new Request('http://dashboard:3000', { headers: { 'X-Real-IP': '203.0.113.1' } }), trusted)).toThrow(BffUnavailable);
});

test('untrusted transport preserves authorization and mutation intent, strips every client IP assertion', async () => {
  const original = fetch, oldFlag = process.env.GARAGEOS_TRUST_CADDY_IP;
  delete process.env.GARAGEOS_TRUST_CADDY_IP;
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer qa-opaque-proof');
      expect(headers.get('Idempotency-Key')).toBe('qa-deliberate-operation');
      expect(headers.has('X-Real-IP')).toBe(false); expect(headers.has('X-Forwarded-For')).toBe(false); expect(headers.has('Forwarded')).toBe(false);
      expect(init?.method).toBe('POST'); expect(init?.body).toBe('{"body":"exact draft"}');
      return Response.json({ ok: true });
    };
    await backendRequest(request('203.0.113.1'), 'http://backend:8000/api/v1/conversations', {
      method: 'POST', body: '{"body":"exact draft"}', headers: {
        Authorization: 'Bearer qa-opaque-proof', 'Idempotency-Key': 'qa-deliberate-operation',
        'X-Forwarded-For': 'fake chain', 'Forwarded': 'for=fake', 'X-Real-IP': 'fake peer',
      },
    });
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = original;
    if (oldFlag === undefined) delete process.env.GARAGEOS_TRUST_CADDY_IP; else process.env.GARAGEOS_TRUST_CADDY_IP = oldFlag;
  }
});

test('Retry-After supports delta seconds and HTTP-date, rejects invalid reflection', () => {
  const date = 'Wed, 21 Oct 2015 07:28:00 GMT';
  expect(validatedRetryAfter('17')).toBe('17'); expect(validatedRetryAfter(date)).toBe(date);
  expect(retryAfterSeconds(date, Date.parse('Wed, 21 Oct 2015 07:27:50 GMT'))).toBe(10);
  for (const bad of ['-1', '1.5', '17,19', 'private upstream detail', '99999999999999999999999999', 'Wed, 32 Oct 2015 07:28:00 GMT']) expect(validatedRetryAfter(bad)).toBeNull();
  expect(proxyResponseHeaders(Response.json({}, { status: 429, headers: { 'Retry-After': '17' } })).get('retry-after')).toBe('17');
  expect(proxyResponseHeaders(Response.json({}, { status: 503, headers: { 'Retry-After': 'private response' } })).has('retry-after')).toBe(false);
});

test('login feedback never interprets rate limits, transport failure or malformed response as invalid credentials', () => {
  expect(loginFailureKey(401, 'INVALID_CREDENTIALS')).toBe('platform.login_credentials');
  expect(loginFailureKey(429, 'RATE_LIMITED')).toBe('platform.login_rate_limited');
  expect(loginFailureKey(503, 'TRUSTED_PROXY_UNAVAILABLE')).toBe('platform.login_unavailable');
  expect(loginFailureKey(502, 'INVALID_BACKEND_RESPONSE')).toBe('platform.login_invalid_response');
  expect(loginFailureKey(403, 'ACCESS_UNAVAILABLE')).toBe('platform.login_access_unavailable');
  expect(loginFailureKey(401, undefined)).toBe('platform.login_access_unavailable');
});
