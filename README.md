# react-base

A reusable React application base for internal IoT device-management front ends: RBAC,
nested type-safe routing with guards, Bearer-JWT auth with reactive refresh, and MQTT
telemetry over WebSocket. See `docs/superpowers/specs/2026-09-07-react-base-design.md` for
the full design.

This file covers running the app locally against the bundled mock API, so you can log in as
each demo role and see the difference with your own eyes rather than reading about it.

## Setup

```bash
npm install
cp .env.example .env   # already points VITE_API_URL at the mock API below
```

Run the mock API and the Vite dev server together:

```bash
npm run dev:all
```

That runs `npm run dev:api` (the mock API, port 8080) and `npm run dev` (Vite, port 5173)
concurrently, using the `concurrently` devDependency. If you would rather use two terminals:

```bash
# terminal 1
npm run dev:api

# terminal 2
npm run dev
```

Open http://localhost:5173.

## Test accounts

The mock API (`mock-api/server.mjs`) seeds three accounts. Password is `password` for all of
them:

| Email | Role | Password |
|---|---|---|
| `admin@example.com` | `admin` | `password` |
| `operator@example.com` | `operator` | `password` |
| `viewer@example.com` | `viewer` | `password` |

These roles and their permissions come straight from `src/lib/rbac/permissions.ts`, and the
mock API enforces the matching checks **server-side** — not just in the UI — so this is a
genuine demonstration of the authorization boundary described in the design spec's §4, not
just its cosmetic layer.

## What each role should see

| | `admin` | `operator` | `viewer` |
|---|---|---|---|
| **Devices** nav item | yes | yes | yes |
| **Users** nav item | yes | no | no |
| Device row delete button | yes | no | no |
| `/devices/:id/settings` | opens | opens | redirects to `/forbidden` |
| `/admin/users` | opens | redirects to `/forbidden` | redirects to `/forbidden` |
| `DELETE /devices/:id` (server) | `204` | `403` | `403` |
| `PATCH /devices/:id` (server) | `200` | `200` | `403` |
| `GET /users` (server) | `200` | `403` | `403` |

Log out and back in as a different account to compare — the nav, the delete button, and the
settings tab should all change with the role, and typing a forbidden URL directly should land
on `/forbidden` with the sidebar still visible rather than a dead end.

## Observing a token refresh

Access tokens default to a 15-minute TTL (`ACCESS_TTL_SECONDS` on the mock API), which is too
long to comfortably watch in a manual session. Lower it to make the refresh interceptor fire
quickly:

```bash
ACCESS_TTL_SECONDS=30 npm run dev:api
```

Log in, then leave the tab open and idle for a little over 30 seconds before clicking around
again (e.g. open the Devices list). The next request gets a `401`, the http client's
single-flight refresh (`src/lib/http/client.ts`) fires exactly once against
`POST /auth/refresh`, and the original request replays automatically with the new access
token — invisibly to you as a user, but visible in the Network tab as a `401` immediately
followed by a `POST /auth/refresh` and a retried request that succeeds. Refreshing the page
after the access token has expired also exercises the equivalent path in `bootstrap()`
(`src/lib/auth/service.ts`): it decodes the expired token, attempts one refresh, and either
restores your session or sends you to `/login`.

## Tests, typecheck, lint, build

```bash
npx vitest run
npm run typecheck
npm run lint
npm run build
```

## Notes on the mock API

`mock-api/server.mjs` is dependency-free (`node:http` + `node:crypto` only) and hand-signs
real HS256 JWTs — it is meant purely for local manual testing and development, not as a
reference for production auth infrastructure (no persistence, no rate limiting, no refresh
token revocation list, a fixed dev-only signing secret). See the design spec's §14 for the
full endpoint contract it implements.
