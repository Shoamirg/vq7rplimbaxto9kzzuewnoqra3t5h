# ADR-002: Rotate and revoke refresh-token sessions server-side

## Status

Accepted

## Date

2026-10-13

## Context

Staff and customer refresh JWTs were stateless. The backend accepted the same signed refresh token repeatedly, and the dashboard stored only the access token, so its refresh flow was unused. Logout only deleted the browser cookie and could not revoke a copied refresh token.

Refresh tokens must be one-time credentials. The system also has to keep supporting signed tokens created before this change and preserve the public login and refresh response shape.

## Decision

- Store a SHA-256 digest of each refresh token in PostgreSQL. Never persist the raw refresh token.
- Give every newly minted refresh JWT a cryptographically random `jti`, so refreshes created during the same second are distinct.
- On refresh, mark the presented token as used and create its successor in the same transaction. A second use revokes every token in that family and returns 401.
- On logout, revoke the token family. A valid pre-migration token that has no database row is tombstoned so it cannot be refreshed after logout.
- Let a valid refresh token created before the migration be exchanged once. This preserves current sessions without retaining stateless replay behavior.
- Apply the same lifecycle to staff and customer principals, with separate foreign keys and distinct JWT `type` claims.
- Keep the existing token response JSON and access-token claims. New refresh tokens add `jti`; legacy tokens without it remain verifiable.
- The Next.js BFF stores refresh tokens in `HttpOnly`, `SameSite=Lax` cookies scoped to its auth routes. It refreshes access tokens server-side; browser JavaScript never reads either token. Access tokens stay short-lived.
- BFF login, refresh, and logout mutations reject cross-site browser requests using Fetch Metadata and the Origin header when present.

## Alternatives considered

### Keep refresh tokens stateless

Rejected because a stolen refresh token could be replayed until expiry, and logout could not revoke it.

### Store raw refresh tokens in PostgreSQL

Rejected because a database read would expose active bearer credentials. Only one-way digests are stored.

### Put all session state in Redis

Rejected because PostgreSQL already provides durable transaction and row-locking support; refresh revocation should survive a Redis restart.

### Immediately reject all tokens created before this change

Rejected because a one-time migration path allows existing sessions to continue while still preventing replay after their first refresh.

## Consequences

- Refresh now depends on PostgreSQL availability and fails closed when session state cannot be read or written.
- Deploying the migration is additive. Existing access tokens continue to work until their normal expiry; legacy refresh tokens migrate once on use.
- Logout revokes refresh capability immediately. An already-issued access token remains valid until its short expiry; the BFF also clears its access cookie.
- Same-tab refresh requests are coalesced, and browsers with the Web Locks API serialize refreshes across tabs. Browsers without that API may need to sign in again if two tabs refresh the same token simultaneously.
- The `refresh_session_tokens` table can be pruned of expired rows in a later maintenance task; deleting expired rows does not restore token validity because the JWT itself is expired.
