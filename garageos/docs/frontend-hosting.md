# Frontend hosting with a Railway backend

The frontend is `garageos/admin-dashboard` in
[`Shoamirg/vq7rplimbaxto9kzzuewnoqra3t5h`](https://github.com/Shoamirg/vq7rplimbaxto9kzzuewnoqra3t5h), branch
`codex/service-work-demo`. `Shoamirg/Backend-repo` contains the backend only.
GitHub currently redirects the former `Shoamirg/garageos` name to that repository.
The frontend also needs `garageos/packages/design-system` and the workspace
lockfile at `garageos/package-lock.json`; keep these in the build checkout.

Use a Next.js host with server rendering and route handlers. The dashboard's
login and `/api/proxy/*` run on the frontend server; a static file upload is
insufficient.

## Required environment

Configure these in the hosting dashboard for both build and runtime:

```dotenv
NEXT_PUBLIC_API_URL=https://backend-repo-production-3c9a.up.railway.app/api/v1
GARAGEOS_TRUST_CADDY_IP=false
NEXT_TELEMETRY_DISABLED=1
```

This is the public Railway hostname supplied for the current deployment;
update it if the backend hostname changes.
Include `/api/v1` once and omit a trailing slash. Do not use Railway's private
hostname, localhost, HTTP, or put database credentials, SSH passwords, tokens,
or `SECRET_KEY` in frontend variables. The provider sets `NODE_ENV=production`.
`NEXTAUTH_SECRET` and `NEXTAUTH_URL` are not used by this frontend's login.

Browser requests use the same-origin frontend route handlers. Those handlers
call Railway and keep the access token in an HttpOnly, Secure cookie on the
frontend hostname. Keep the existing origin checks enabled. Do not enable the
Caddy IP-header opt-in on managed hosting: its trust boundary is different.

After choosing the frontend hostname, add its exact HTTPS origin (without a
path) to Railway's `CORS_ORIGINS`, preserving other required origins. Do not
use a wildcard. Frontend server-to-server calls do not need browser CORS, but
browser clients calling the backend directly do.

## Netlify

Netlify Free permits commercial projects. Its monthly usage limits can pause
the site when exhausted. Use the Free plan without enabling paid upgrades.

Import the frontend repository and select `codex/service-work-demo`:

The repository-root `netlify.toml` supplies the base, build command, publish
directory, Node version and baseline browser security headers below. Set the
package directory and environment variables in the Netlify dashboard.

| Setting | Value |
| --- | --- |
| Base directory | `garageos` |
| Package directory | `garageos/admin-dashboard` |
| Build command | `npm run build --workspace=admin-dashboard` |
| Publish directory (relative to base) | `admin-dashboard/.next` |
| Node version | `22` |

The config explicitly enables Netlify's Next.js adapter so manual CLI builds
also package route handlers and server rendering. Do not select a plain static
SPA deployment or add a catch-all redirect to `index.html`. Anonymous Drop
deploys support static files only and cannot serve this dashboard's login/API;
use an authenticated deployment for the completed frontend.

For a local Windows CLI build, run
`python scripts/prepare_netlify_windows.py` from `garageos` after `netlify build`
and before `netlify deploy --prod --no-build`. OpenNext 5.16.2 generates Windows
paths for the Lambda loader in this monorepo; the helper normalizes the generated
loader and ZIP to the Linux paths used by Netlify and verifies the imported
modules exist in the archive. Linux cloud builds do not need this step.

Sources: [Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[monorepo settings](https://docs.netlify.com/build/configure-builds/monorepos/),
[Free plan](https://www.netlify.com/blog/introducing-netlify-free-plan/).

## Vercel

Vercel Hobby is restricted to personal, non-commercial use. GarageOS is a
startup/client project; use an existing Pro account if choosing Vercel.
Do not start a paid plan or trial without the account owner's agreement.

Import the frontend repository, then choose these settings:

| Setting | Value |
| --- | --- |
| Production branch | `codex/service-work-demo` |
| Framework preset | `Next.js` |
| Root directory | `garageos/admin-dashboard` |
| Include source files outside Root Directory | Enabled |
| Install command | `cd .. && npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default (`.next`) |
| Node version | `22.x` |

Sources: [Hobby usage](https://vercel.com/docs/plans/hobby),
[monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq).

## Minimal deployment verification

The local production build passed on 2026-10-14 with existing lint warnings.
It used a placeholder backend URL and does not prove Railway connectivity.
The initial live check on 2026-10-14 returned `/health` 200 and `/ready` 503:
database and Redis checks both failed. `/version` reported development/debug
mode. Configure Railway Variables from the backend's `.env.example`, using
the actual PostgreSQL/Redis service names, and redeploy before testing login.
After the backend build finishes, confirm its `/ready` returns HTTP 200.
Then verify frontend HTTPS, `/healthz`, `/login`, one real login, a dashboard
read, and logout. Check login failures in both providers' logs without copying
credentials. Do not claim the system is live until this smoke check passes.

For rollback, redeploy the preceding working frontend deployment in the host's
dashboard. Keep backend data and migrations unchanged during a frontend rollback.
Configure the custom domain only after the provider URL works.
