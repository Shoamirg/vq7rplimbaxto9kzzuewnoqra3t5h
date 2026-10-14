// Runtime-agnostic constants (safe to import from middleware / edge runtime).
export const AUTH_COOKIE = "garageos_token";
// Public session identity proof only. This SHA-256 fingerprint never grants
// access; authenticated operations still require the httpOnly token.
export const AUTH_FINGERPRINT_COOKIE = 'garageos_auth_fingerprint';
// Marks the session as the read-only public demo (drives the demo banner).
export const DEMO_COOKIE = "garageos_demo";
