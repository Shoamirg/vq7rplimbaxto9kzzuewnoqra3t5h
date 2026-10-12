# ADR-001: Use PyJWT for signed token handling

## Status

Accepted

## Date

2026-10-12

## Context

The backend uses signed JWT access and refresh tokens. Its required token format is JWS with the configured HMAC algorithm (`HS256` by default); the application does not encrypt JWTs with JWE.

The backend dependency audit found known issues in the pinned `python-jose` and its `ecdsa` dependency. Updating `python-jose` to the available fixed release would not remove every audit finding, and the `ecdsa` timing issue has no upstream fix. The application only needs JWT signing and verification, so retaining JWE support adds unused surface and dependencies.

## Decision

Use [PyJWT](https://pypi.org/project/PyJWT/) for token encoding and decoding. Pin the audited dependency set in `garageos/backend/requirements.txt`, remove `python-jose`, and keep the existing signed JWT claims and algorithm allow-list. Add token tests that cover expiry, tampered signatures, and fixed access and refresh tokens produced by the previous library to prove existing sessions remain compatible. Production configuration must also reject placeholder/short JWT secrets and `DEBUG=true`.

Upgrade FastAPI and Starlette together to compatible security-fixed releases, update the other packages identified by `pip-audit`, and run a Python dependency audit as its own CI job.

## Alternatives considered

### Keep `python-jose` and only upgrade it

Rejected because that leaves the no-fix `ecdsa` advisory and the remaining `python-jose` audit finding in the dependency tree.

### Suppress the audit findings

Rejected because the runtime JWT library and framework stack had available fixes; ignoring the report would conceal remediable exposure.

## Consequences

- Existing HS256 access and refresh tokens remain valid; no login/API contract or claim changes are intended.
- JWT encryption (JWE) is not supported. The current application does not use JWE.
- Production startup fails fast unless the JWT secret is at least 32 bytes and debug mode is disabled.
- The full backend test suite, browser tests, and dependency audit must pass in CI before this dependency update is considered verified.
