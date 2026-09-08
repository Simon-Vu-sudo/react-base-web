# react-base

A reusable React application base for internal IoT device-management front ends: RBAC,
nested type-safe routing with guards, Bearer-JWT auth with reactive refresh, and MQTT
telemetry over WebSocket. See `docs/superpowers/specs/2026-09-07-react-base-design.md` for
the full design.

## Setup

```bash
npm install
cp .env.example .env    # then point VITE_API_URL at your backend
npm run dev             # Vite on http://localhost:5173
```

There is **no backend in this repository.** Set `VITE_API_URL` to wherever your API runs.
Until it answers `POST /auth/login`, you will not be able to sign in — the frontend has no
fallback session and deliberately fabricates nothing.

## What your backend must provide

The frontend sends `Authorization: Bearer <accessToken>` on every request and never reads a
cookie.

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `200 { accessToken, refreshToken }` / `401` |
| POST | `/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` / `401` |
| POST | `/auth/logout` | — | `204` |
| GET | `/devices` | — | `200 Device[]` |
| GET | `/devices/:id` | — | `200 Device` / `404` |
| PATCH | `/devices/:id` | partial `Device` | `200 Device` |
| DELETE | `/devices/:id` | — | `204` |
| GET | `/users` | — | `200 User[]` |

**The access token's claims are the frontend's only source of identity.** It decodes the
payload for `sub`, `email`, `name` and `roles` — there is no `/auth/me` call. So the JWT must
carry:

```json
{ "sub": "u1", "email": "a@b.co", "name": "Ann", "roles": ["admin"], "exp": 1893456000 }
```

`roles` must contain strings matching the keys of `ROLE_PERMISSIONS` in
`src/lib/rbac/permissions.ts` (`admin`, `operator`, `viewer` as shipped). A role the frontend
does not recognise is ignored with a dev warning rather than crashing — the user simply gets
no permissions from it.

Return `401` from any protected endpoint when the token is missing, invalid or expired; that
is what triggers the refresh interceptor. Return `403` when the token is valid but the role
lacks permission — the frontend refetches the session on a `403`, so a mid-session role change
corrects itself.

## Permissions

The backend sends **roles**; the frontend maps them to permissions in
`src/lib/rbac/permissions.ts`. To add a permission:

1. Add it to `PERMISSIONS`
2. Grant it to roles in `ROLE_PERMISSIONS`
3. Guard the route with `requirePermission(...)`, and gate any control with `<Can>`
4. Add a nav entry to `src/config/nav.ts` if it needs one

**The frontend permission layer is UX, not authorization.** Route guards and `<Can>` keep
users out of dead ends and keep the UI honest. Anyone can edit a JS bundle, so your API must
enforce the same rules — see the design spec's §4.

As shipped, the demo expects:

| | `admin` | `operator` | `viewer` |
|---|---|---|---|
| **Devices** nav item | yes | yes | yes |
| **Users** nav item | yes | no | no |
| Device row delete button | yes | no | no |
| `/devices/:id/settings` | opens | opens | redirects to `/forbidden` |
| `/admin/users` | opens | redirects to `/forbidden` | redirects to `/forbidden` |

## How auth behaves

- **Page load** — `bootstrap()` reads the access token from storage and decodes it. Valid →
  session restored with no network call. Expired → one refresh attempt. Absent or
  undecodable → unauthenticated. This resolves *before* the router mounts, so no guard ever
  runs against an unknown session.
- **Any `401`** — a module-level single-flight refresh fires exactly once no matter how many
  requests failed concurrently, then each original request replays exactly once. `/auth/*`
  paths are exempt, or a failing refresh would recurse.
- **Any `403`** — the session is refetched, so a role change on the backend corrects the UI
  within one request.
- **Logout** — clears tokens, clears the TanStack Query cache (without this, the next user on
  the same tab would see the previous user's cached data), and closes the MQTT connection.

Tokens live in `localStorage`, behind `src/lib/auth/tokenStore.ts`. That is inherent to Bearer
auth and means they are readable by any XSS on the page; keeping it behind one module means a
project wanting memory-only access tokens changes a single file.

## MQTT

`VITE_MQTT_URL` must point at a broker exposing a **WebSocket** listener — MQTT.js in the
browser cannot speak raw TCP. `docker compose up -d` starts a local Mosquitto with one
enabled (`allow_anonymous true`, development only).

The client authenticates with the JWT as the MQTT password (`username: 'jwt'`) and refreshes
it on reconnect, so your broker must validate that token — typically via its HTTP auth hook
(EMQX, HiveMQ) or a proxy that terminates the WebSocket. Per-topic ACLs are the real
enforcement; the frontend's permission check only prevents accidental subscribes.

Telemetry never enters the Query cache: readings are batched per animation frame into a
Zustand store, so a device publishing at 10 Hz cannot cause 10 renders a second. Device
*events* (registered, deleted) do invalidate Query, because those are statements about REST
data.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Unit and integration tests |
| `npm run test:cov` | Tests with coverage thresholds on `src/lib` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run e2e` | Playwright (see note below) |
| `npm run routes:check` | Fails if the committed route tree is stale |

**`npm run e2e` has no specs yet.** The original Playwright suite was written against
cookie-based auth and was removed when the app moved to Bearer tokens; the config, CI workflow
and Mosquitto compose file remain, so the specs can be rewritten against the current auth.

## Structure

```
src/
  lib/          reusable core — rbac, auth, http, mqtt, query
  modules/      feature modules
    global/components/   shared components (primitives + AppShell)
    auth/ devices/ users/
  routes/       TanStack Router file-based tree (thin)
  config/       nav manifest, env parsing
  test/         setup, fetch stub, fake MQTT client, render helpers
  router.tsx  AppRoot.tsx  main.tsx
```

A module may import from `lib/`, `config/` and `modules/global/`, but not from another
module's internals — enforced by ESLint. `lib/` is the part you keep; `modules/` is the demo
you delete:

```bash
rm -rf src/modules/devices src/modules/users
rm src/routes/_auth.devices.* src/routes/_auth.admin.*
```

Then drop those entries from `src/config/nav.ts` and the demo permissions from
`src/lib/rbac/permissions.ts`.
