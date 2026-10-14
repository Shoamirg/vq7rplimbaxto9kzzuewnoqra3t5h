import { expect, test } from '@playwright/test';
import { staffAuthTransition, AuthTransitionUnavailable, AuthTransitionConflict, captureAuthOwnership, authTransitionMarkerCurrent, requireAuthFingerprint } from '../lib/auth-transition';

const descriptors = new Map<string, PropertyDescriptor | undefined>();
test.afterEach(() => {
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  descriptors.clear();
});
function install(name: string, value: unknown) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
function browser({ locks = true, storage = true } = {}) {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (!storage) throw new Error('storage blocked'); values.set(key, value); },
  };
  let tail = Promise.resolve();
  const request = (_name: string, _options: unknown, callback: () => Promise<unknown>) => {
    const result = tail.then(callback);
    tail = result.then(() => {}, () => {});
    return result;
  };
  install('window', { isSecureContext: true, localStorage });
  install('navigator', { locks: locks ? { request } : undefined });
  return values;
}

test('shared auth coordination completes held logout cookie cleanup and navigation before newer login dispatch', async () => {
  browser();
  const actions: string[] = [];
  let release!: () => void, arrived!: () => void;
  const held = new Promise<void>(resolve => release = resolve), entered = new Promise<void>(resolve => arrived = resolve);
  const logout = staffAuthTransition(async current => {
    actions.push('logout dispatch'); arrived(); await held;
    actions.push('old cookie cleanup');
    if (current()) actions.push('logout navigation');
  });
  await entered;
  const login = staffAuthTransition(async current => {
    actions.push('new login dispatch');
    actions.push('new cookie installed');
    if (current()) actions.push('new login navigation');
  });
  expect(actions).toEqual(['logout dispatch']);
  release(); await Promise.all([logout, login]);
  expect(actions).toEqual(['logout dispatch', 'old cookie cleanup', 'logout navigation', 'new login dispatch', 'new cookie installed', 'new login navigation']);
});

test('an invalidated public ordering marker cannot authorize late auth navigation', async () => {
  const values = browser();
  await staffAuthTransition(async current => {
    expect(current()).toBe(true);
    for (const key of values.keys()) values.set(key, 'newer-transition');
    expect(current()).toBe(false);
  });
});

for (const option of [{ locks: false }, { storage: false }]) test(`unsupported auth coordinator fails before any cookie-changing request ${JSON.stringify(option)}`, async () => {
  browser(option);
  let dispatched = false;
  await expect(staffAuthTransition(async () => { dispatched = true; })).rejects.toBeInstanceOf(AuthTransitionUnavailable);
  expect(dispatched).toBe(false);
});

test('old-profile logout cannot wait behind another pending login and then revoke its new identity', async () => {
  browser();
  const oldOwner = captureAuthOwnership();
  let release!: () => void, arrived!: () => void, dispatched = false;
  const held = new Promise<void>(resolve => release = resolve), entered = new Promise<void>(resolve => arrived = resolve);
  const login = staffAuthTransition(async () => { arrived(); await held; });
  await entered;
  await expect(staffAuthTransition(async () => { dispatched = true; }, oldOwner)).rejects.toMatchObject({ reason: 'busy' });
  expect(dispatched).toBe(false);
  release(); await login;
  await expect(staffAuthTransition(async () => { dispatched = true; }, oldOwner)).rejects.toBeInstanceOf(AuthTransitionConflict);
  expect(dispatched).toBe(false);
  const refreshedOwner = captureAuthOwnership();
  await staffAuthTransition(async () => { dispatched = true; }, refreshedOwner);
  expect(dispatched).toBe(true);
});

test('logout repeats its ownership check under the lock before any purge or request', async () => {
  const values = browser();
  const oldOwner = captureAuthOwnership();
  let dispatched = false;
  const logout = staffAuthTransition(async () => { dispatched = true; }, oldOwner);
  values.set('garageos.staff-auth-generation.v1', JSON.stringify({ epoch: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', phase: 'completed' }));
  await expect(logout).rejects.toMatchObject({ reason: 'stale' });
  expect(dispatched).toBe(false);
});

test('completion preserves the notice epoch and makes the rendered new identity ownable', async () => {
  browser();
  await staffAuthTransition(async (current, marker, complete) => {
    expect(captureAuthOwnership().settled).toBe(false);
    complete();
    expect(current()).toBe(true);
    expect(authTransitionMarkerCurrent(marker)).toBe(true);
    expect(captureAuthOwnership()).toMatchObject({ epoch: marker, settled: true, available: true });
  });
});

test('failed own logout may be deliberately retried without permitting another tab owner', async () => {
  browser();
  const owner = captureAuthOwnership(), oldOtherTab = captureAuthOwnership();
  await expect(staffAuthTransition(async () => { throw new Error('HTTP logout unavailable'); }, owner)).rejects.toThrow('HTTP logout unavailable');
  await expect(staffAuthTransition(async () => {}, oldOtherTab)).rejects.toMatchObject({ reason: 'stale' });
  let retried = false;
  await staffAuthTransition(async () => { retried = true; }, owner);
  expect(retried).toBe(true);
});

test('render-bound logout fingerprint rejects a stale same-principal session before modifying the ledger', async () => {
  const values = browser();
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  install('document', { cookie: `garageos_auth_fingerprint=${second}` });
  const owner = captureAuthOwnership();
  let dispatched = false;
  await expect(staffAuthTransition(async () => { dispatched = true; }, owner, () => requireAuthFingerprint(first))).rejects.toMatchObject({ reason: 'stale' });
  expect(dispatched).toBe(false); expect(values.size).toBe(0);
  await staffAuthTransition(async () => { dispatched = true; }, owner, () => requireAuthFingerprint(second));
  expect(dispatched).toBe(true);
});

test('acquisition rechecks the render fingerprint without changing the newer owner ledger', async () => {
  const values = browser();
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  const document = { cookie: `garageos_auth_fingerprint=${first}` };
  install('document', document);
  await staffAuthTransition(async () => {});
  const before = [...values.entries()], owner = captureAuthOwnership();
  let dispatched = false;
  const logout = staffAuthTransition(async () => { dispatched = true; }, owner, () => requireAuthFingerprint(first));
  document.cookie = `garageos_auth_fingerprint=${second}`;
  await expect(logout).rejects.toMatchObject({ reason: 'stale' });
  expect(dispatched).toBe(false); expect([...values.entries()]).toEqual(before);
});
