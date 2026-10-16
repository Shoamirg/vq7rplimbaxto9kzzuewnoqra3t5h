// Only a non-secret ordering marker is stored. Authentication remains in the
// httpOnly cookie; this marker grants no access and carries no identity.
import { AUTH_FINGERPRINT_COOKIE } from './api/constants';
const LOCK = 'garageos.staff-auth-transition.v1';
const GENERATION = 'garageos.staff-auth-generation.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Ledger = { epoch: string; phase: 'pending' | 'completed' };
export type AuthOwnership = { epoch: string | null; settled: boolean; available: boolean };

export class AuthTransitionUnavailable extends Error {
  constructor() { super('Safe browser authentication coordination unavailable'); }
}

export class AuthTransitionConflict extends Error {
  constructor(public reason: 'busy' | 'stale') { super('Browser authentication ownership changed'); }
}

/** No credentials are read by JavaScript. This public server-set fingerprint
 * distinguishes even two consecutive logins by the same principal.
 */
export function requireAuthFingerprint(expected: string | null) {
  const values = document.cookie.split(';').map(value => value.trim()).filter(value => value.startsWith(AUTH_FINGERPRINT_COOKIE + '='));
  const actual = values.length === 1 ? values[0].slice(AUTH_FINGERPRINT_COOKIE.length + 1) : null;
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new AuthTransitionConflict('stale');
}

function readLedger(): Ledger | null {
  const value = window.localStorage.getItem(GENERATION);
  if (value === null) return null;
  // Existing ordering markers contained just this public nonce.
  if (UUID.test(value)) return { epoch: value, phase: 'completed' };
  try {
    const ledger = JSON.parse(value) as Ledger;
    if (ledger && UUID.test(ledger.epoch) && ['pending', 'completed'].includes(ledger.phase)) return ledger;
  } catch { /* Malformed ordering state never permits logout. */ }
  throw new AuthTransitionUnavailable();
}

/** Capture once for the freshly rendered authenticated profile. Pending state
 * is ambiguous: a page rendered during another login must refresh first.
 */
export function captureAuthOwnership(): AuthOwnership {
  try {
    const ledger = readLedger();
    return { epoch: ledger?.epoch ?? null, settled: ledger?.phase !== 'pending', available: true };
  } catch { return { epoch: null, settled: false, available: false }; }
}

function requireLogoutOwnership(owner: AuthOwnership) {
  if (!owner.available) throw new AuthTransitionUnavailable();
  const ledger = readLedger();
  if (ledger?.phase === 'pending') throw new AuthTransitionConflict('busy');
  if (!owner.settled || (ledger?.epoch ?? null) !== owner.epoch) throw new AuthTransitionConflict('stale');
}

export function authTransitionMarkerCurrent(marker: string | null): boolean {
  if (!marker) return false;
  try { return readLedger()?.epoch === marker; }
  catch { return false; }
}

/** Serialize cookie-changing UI operations across every tab of this origin.
 * Fail closed when secure Web Locks/storage are unavailable: never dispatch
 * competing login/demo/logout operations using a best-effort tab-only flag.
 * Navigation belongs inside the callback, before the shared lock is released.
 */
export async function staffAuthTransition<T>(
  perform: (current: () => boolean, marker: string, complete: () => void) => Promise<T>,
  logoutOwner?: AuthOwnership,
  preflight?: () => void,
): Promise<T> {
  if (!window.isSecureContext || !navigator.locks) throw new AuthTransitionUnavailable();
  const requestedOwner = logoutOwner ? { ...logoutOwner } : undefined;
  preflight?.();
  // Reject an old profile at click time, then repeat under the shared lock.
  // Waiting behind a new login must never turn an old logout into its logout.
  if (requestedOwner) requireLogoutOwnership(requestedOwner);
  return navigator.locks.request(LOCK, { mode: 'exclusive' }, async () => {
    preflight?.();
    if (requestedOwner) requireLogoutOwnership(requestedOwner);
    const marker = crypto.randomUUID();
    const current = () => authTransitionMarkerCurrent(marker);
    const save = (phase: Ledger['phase']) => {
      try { window.localStorage.setItem(GENERATION, JSON.stringify({ epoch: marker, phase })); }
      catch { throw new AuthTransitionUnavailable(); }
      if (!current()) throw new AuthTransitionUnavailable();
    };
    try { save('pending'); }
    catch { throw new AuthTransitionUnavailable(); }
    const complete = () => { if (current()) save('completed'); };
    try { return await perform(current, marker, complete); }
    finally {
      complete();
      // A failed own logout can be deliberately retried on the same profile.
      // Advance only its ownership, while still holding the shared lock. A
      // competing login cannot mutate the click-time copy above or own this ref.
      if (logoutOwner && current()) Object.assign(logoutOwner, { epoch: marker, settled: true, available: true });
    }
  });
}

export function authTransitionFailureKey(error: unknown): string {
  if (error instanceof AuthTransitionConflict) return error.reason === 'busy' ? 'platform.auth_transition_busy' : 'platform.auth_transition_stale';
  return error instanceof AuthTransitionUnavailable ? 'platform.auth_coordination_unavailable' : 'platform.logout_failed';
}
