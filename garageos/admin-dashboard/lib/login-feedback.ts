/** Only protocol-valid Retry-After values may cross the BFF boundary. */
export function validatedRetryAfter(value: string | null): string | null {
  if (!value) return null;
  if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return value;
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date.toUTCString() === value) return value;
  }
  return null;
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  const valid = validatedRetryAfter(value);
  if (!valid) return null;
  return /^\d+$/.test(valid) ? Number(valid) : Math.max(0, Math.ceil((Date.parse(valid) - now) / 1000));
}

export function loginFailureKey(status: number, code: unknown): string {
  if (status === 429) return 'platform.login_rate_limited';
  if (status === 401 && code === 'INVALID_CREDENTIALS') return 'platform.login_credentials';
  if (code === 'ACCESS_UNAVAILABLE' || status === 401 || status === 403) return 'platform.login_access_unavailable';
  if (status === 400 || status === 422) return 'platform.login_invalid_input';
  if (code === 'INVALID_BACKEND_RESPONSE') return 'platform.login_invalid_response';
  return 'platform.login_unavailable';
}
