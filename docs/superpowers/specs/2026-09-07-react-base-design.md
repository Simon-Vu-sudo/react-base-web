# React Base — Design Spec

**Date:** 2026-09-07
**Status:** Approved (design), pending implementation plan

## 1. Overview

A reusable React application base, built on Vite, for internal IoT device-management front ends. It ships six cross-cutting capabilities as first-class, tested modules:

1. **Phân quyền (RBAC)** — role-based permissions, resolved on the FE from roles sent by the BE
2. **Routing / sub-routing** — nested, type-safe routes with guards that compose by nesting
3. **Auth** — Bearer JWTs with reactive token refresh (decoded client-side for UI gating; the BE remains the authorization boundary)
4. **MQTT** — IoT telemetry over MQTT-over-WebSocket
5. **Unit tests** — Vitest + React Testing Library
6. **Automation tests** — Playwright

The base includes one minimal but complete vertical slice (login → dashboard → devices → device detail → permission-gated settings tab → admin users) that exercises every pattern exactly once and can be deleted with `rm -rf`.

## 2. Non-goals

- Object-level / ownership-based permissions ("can edit own posts"). Flat permission strings only.
- SSR. This is a client-rendered SPA.
- A component library. Tailwind plus a small set of hand-rolled primitives.
- A real MQTT broker in CI. E2E uses an in-memory fake transport.
- i18n, theming, analytics. Out of scope for the base.

## 3. Locked decisions

| Area | Decision |
|---|---|
| Permission mapping | Static typed map in FE code; BE sends roles only |
| Permission granularity | Flat permission strings, no object context |
| Auth transport | **JWT** access + refresh tokens, returned in the `POST /auth/login` / `/auth/refresh` response bodies and sent back as `Authorization: Bearer <accessToken>` |
| Token storage | `localStorage`, behind one module (`lib/auth/tokenStore.ts`) — see §3.1 for the trade-off |
| User data source | **The access token's own claims** (`sub`, `email`, `name`, `roles`) are the source of identity and roles — there is no `GET /auth/me` |
| Session bootstrap | No network call in the common case — decode the stored access token; refresh once if it is expired (§7.1) |
| Token refresh | Reactive, on 401 (or an expired token found at bootstrap), single-flight, replay once |
| CSRF | Not applicable — CSRF exploits the browser auto-attaching cookies; a Bearer header is attached by application code, so the vector does not exist (`lib/http/csrf.ts` removed) |
| Router | TanStack Router (file-based, type-safe) |
| Data layer | TanStack Query for REST |
| Client state | Zustand |
| Socket | MQTT.js over WebSocket |
| Forms | react-hook-form + zod |
| Styling | Tailwind only, hand-rolled primitives |
| Structure | Feature-first, cross-cutting infrastructure in `src/lib` |
| Unit tests | Vitest + RTL + jsdom; **no MSW**, hand-rolled fetch stubs |
| E2E | Playwright |
| Denial UX | Visible `/forbidden` page (not a 404) |
| `routeTree.gen.ts` | Committed to the repo; CI verifies it is current |
| Language | TypeScript, strict |

### 3.1 On JWTs specifically — Bearer, not HttpOnly cookies

This base was originally cookie-based (§16 history: the FE never touched a token
string; `GET /auth/me` was the sole identity source). The owner reversed that decision.
The frontend now **holds both tokens and reads its own claims out of the access token**.
This is a deliberate architecture change, not a drift, and it is worth stating the
trade-off plainly rather than leaving it implicit:

- **The access token lives in `localStorage`, and `localStorage` is readable by any
  script that can execute in the page's origin.** A successful XSS can read both
  tokens and exfiltrate them. HttpOnly cookies do not have this exposure — that is
  the entire reason the previous design used them.
- In exchange, the frontend gets to decode its own identity and roles without a
  network round-trip, gets an explicit, application-controlled point (the
  `Authorization` header) rather than an implicit browser behaviour, and stops
  needing CSRF protection, since CSRF specifically exploits the browser
  auto-attaching a cookie the app didn't ask it to send.
- **Signature verification is never attempted client-side** (`lib/auth/jwt.ts`). The
  frontend cannot hold the signing secret, and a check against a key the client
  doesn't have would prove nothing to an attacker who can edit the token in devtools
  anyway. Decoded claims are for **display and UI gating only**; the backend, which
  re-verifies every request, remains the sole authorization boundary (§4). This was
  already true of the old design's permission layer — decoding on the client instead
  of getting claims from `/auth/me` does not change where the boundary sits.
- This is a one-file trade: everything reads/writes tokens through
  `lib/auth/tokenStore.ts`. A project that wants to reduce the XSS blast radius (at
  the cost of "a page refresh always needs a silent-refresh round-trip", or "logs the
  user out") would change only that file to hold the access token in memory instead.

Practical consequences of the frontend reading the JWT:

- `Authorization: Bearer <accessToken>` is attached to every request that has a
  token (there is a test asserting its *presence*, inverted from the old design).
- Refresh is still **reactive on 401** for the http client's single-flight path, but
  bootstrap additionally does one **proactive** refresh when the stored token's own
  `exp` claim has already passed — the frontend can decode expiry now, so there is no
  reason to make a doomed request first (§7.1).
- Identity and roles come from decoding the access token (`lib/auth/jwt.ts`), not from
  `GET /auth/me` — that endpoint no longer exists in this design (§7.1).
- The MQTT broker gets the access token as its password (§10.2), since there is no
  session cookie to ride the WebSocket upgrade automatically anymore.

## 4. Security boundary

**The FE permission layer is UX, not authorization.**

| Layer | Prevents | Security boundary? |
|---|---|---|
| Route guard (`beforeLoad`) | navigating to a page | No |
| `<Can>` / `usePermissions` | seeing a control | No |
| BE endpoint authorization | the action | **Yes** |
| Broker topic ACL | subscribe / publish | **Yes** |

Anyone can edit a JS bundle or open a WebSocket by hand. The FE layers keep users out of dead ends and keep the UI honest; they must never be the only check.

## 5. Project structure

```
src/
  main.tsx                composition root: hooks, providers, bootstrap, mounts <AppRoot>
  AppRoot.tsx              <QueryClientProvider> + <RouterProvider>, renders the bootstrapError screen
  router.tsx               createRouter() — lives at src/ root, not lib/, because it imports
                           routeTree.gen.ts; putting it in lib/ would make the reusable core
                           depend on this app's route tree
  routeTree.gen.ts         generated, committed
  routes/                 TanStack Router file-based tree (thin; imports from modules)
  lib/                    cross-cutting infrastructure — the reusable core
    rbac/                 permissions.ts, resolve.ts, predicates.ts, guards.ts, <Can>, usePermissions
    auth/                 authStore, service (bootstrap/login/logout), tokenStore, jwt, safeRedirect
    http/                 apiFetch, refresh single-flight (Bearer tokens)
    mqtt/                 topics, client, connectionStore, batcher, telemetryStore, useMqttSubscription
    query/                client.ts — the shared TanStack QueryClient instance
  modules/                feature modules — each owns its api, queries, components
    global/
      components/         shared components: Tailwind primitives + AppShell + AppErrorBoundary
    auth/                 LoginForm
    devices/              api, queries, useDeviceEvents, components/
    users/                api, queries
  config/                 nav manifest, env parsing
  test/                   setup, fetch stub helper, fake mqtt client, render helpers
mock-api/                 dependency-free Node mock API for manual auth/RBAC testing
e2e/                      Playwright specs + fixtures
docs/superpowers/specs/   this document
```

There is deliberately no `src/app/` folder. `AppErrorBoundary` is a component, so it lives in
`modules/global/components/` next to the other shared components. `queryClient` is pure
infrastructure with no route coupling, so it lives in `lib/query/`. `router.tsx` and
`AppRoot.tsx` are the two files that cannot move into `lib/` without breaking the "delete
`modules/`, keep `lib/`" property, because `router.tsx` imports the app-specific
`routeTree.gen.ts` — so they sit at `src/` root instead, as the composition root alongside
`main.tsx`.

**Import rules.** A module may import from `lib/`, `config/`, and `modules/global/`. A module must **not** reach into another module's internals — enforced by an ESLint `no-restricted-imports` pattern scoped to `src/modules/**`, with `@/modules/global/**` carved out by negation since it exists precisely to be shared. The route tree is the intended consumer of module internals and is deliberately not covered by the rule. Anything genuinely shared between modules that is not a component gets promoted into `lib/`.

`modules/global` is a module like any other, which is why its components live in `modules/global/components/` — the same shape as `modules/devices/components/`.

## 6. RBAC layer (`src/lib/rbac/`)

### 6.1 Declaration

One source of truth. Permissions and the role map are declared once, typed:

```ts
export const PERMISSIONS = {
  DEVICE_VIEW:   'device.view',
  DEVICE_WRITE:  'device.write',
  DEVICE_DELETE: 'device.delete',
  USER_VIEW:     'user.view',
  USER_MANAGE:   'user.manage',
} as const
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ROLE_PERMISSIONS = {
  admin:    [/* all permissions */],
  operator: [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE],
  viewer:   [PERMISSIONS.DEVICE_VIEW],
} satisfies Record<string, readonly Permission[]>
```

### 6.2 Resolution

`resolvePermissions(roles: string[]): Set<Permission>` unions the mapped permissions for each role. It is computed **once** at session bootstrap and stored; never recomputed during render.

**An unrecognised role is ignored, with a dev-only `console.warn`. It is never fatal.** When the BE introduces a role the FE does not yet know, the user receives no permissions from it and sees a degraded UI plus a warning — not a crash. This is the single most important behaviour in the module.

### 6.3 Consumption surfaces

All four read the same resolved `Set`:

- `can(perms, p)` / `canAll(perms, ps)` / `canAny(perms, ps)` — pure functions, no React
- `usePermissions()` → `{ can, canAll, canAny }` — store-bound hook
- `<Can permission="device.write" fallback={null}>` — declarative element gating
- `requireAuth` / `requirePermission(...)` — route guards (section 8)

## 7. Auth (`src/lib/auth/`, `src/lib/http/`)

### 7.1 Bootstrap

`bootstrap()` (`lib/auth/service.ts`) runs **once, before `RouterProvider` mounts** (called
from `main.tsx`), and seeds the auth store. Guards therefore never run against an unknown
session, which eliminates redirect flicker and guard races. Unlike the cookie design, this
makes **no network call in the common case** — there is no `GET /auth/me`; identity and
roles are decoded straight from the access token already sitting in `tokenStore`:

| Stored access token | Outcome |
|---|---|
| absent, or undecodable (`decodeJwt` returns `null`) | `unauthenticated` |
| present and unexpired | `authenticated` — user + resolved permissions decoded straight from the claims, no request made |
| present but expired (`isExpired` is true) | one refresh attempt — see below |

**The expired-token refresh attempt still has three outcomes, and the third one matters
exactly as much as it did under cookie auth:**

| `POST /auth/refresh` result | State |
|---|---|
| `200` with a new token pair | `authenticated` — new tokens stored, session decoded from the new access token |
| `401` (the refresh token is also dead) | `unauthenticated` — router mounts, guards send the user to `/login` |
| network error / `5xx` | **`bootstrapError`** — full-page "cannot reach server" with retry |

The third case is mandatory, and it is *narrower* now than it was under cookie auth: it can
only be reached by a user whose access token had already expired locally, since a valid
token authenticates with zero network calls. It is still necessary — treating "the server is
down" as "this token is bad" would silently sign out every such user and strand them on a
login page that also cannot work. `bootstrapError` is kept in the store's `AuthStatus` type
for exactly this narrower case.

### 7.2 Store

`authStore` (Zustand):

```ts
{
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrapError'
  user: { id, email, name, roles: string[] } | null
  permissions: Set<Permission>
}
```

### 7.3 HTTP client and refresh

A single `apiFetch` wrapper. It attaches `Authorization: Bearer <accessToken>` when
`tokenStore.getAccessToken()` returns one, and nothing otherwise — this **reverses** the
cookie design's rule, which asserted the header's absence. `credentials: 'include'` is gone;
it implied cookie auth and means nothing for a Bearer header attached by application code.

On `401`:

1. Join a **module-level single-flight promise**, so N concurrent 401s produce exactly one
   `POST /auth/refresh` — sent with an explicit body, `{ refreshToken }`, since there is no
   cookie for the BE to read implicitly
2. On success (`{ accessToken, refreshToken }` back), `setTokens(...)` the rotated pair, then
   replay each original request **exactly once**, now carrying the *new* access token —
   tracked by a per-request retry counter so a misbehaving BE cannot cause an infinite loop
3. On failure, `clearTokens()`, then the existing `onRefreshFailed` hook: clear the auth
   store, call `queryClient.clear()`, and redirect to `/login?redirect=<current>`

`/auth/*` paths are exempt from the interceptor entirely; without this, a failing refresh
recurses. These three properties — single-flight, replay-once, `/auth/*` exemption — are
unchanged by the Bearer migration and still each have a dedicated test.

On `403`: there is no `/auth/me` to refetch, so `resyncSession()` forces one refresh call and
decodes the new access token to pick up a role change made on the BE mid-session. A failure
here is left alone — the `401` path above already handles a truly dead session. Re-running
the guards is *not* done here — updating the store triggers the subscription in section 8.4,
which invalidates the router. One mechanism, one place.

### 7.4 Logout

`POST /auth/logout` (best-effort — the BE has nothing to clear client-side, so a failure here
is swallowed rather than blocking logout), then `clearTokens()`, reset the auth store,
`client.endAsync()` the MQTT connection, and call **`queryClient.clear()`**.

Clearing the Query cache is not optional: without it, a second user logging in on the same tab sees the first user's cached device list. That is a permission leak.

## 8. Routing and guards (`src/routes/`, `src/lib/rbac/guards.ts`)

### 8.1 Route tree

Pathless layout routes (the `_` prefix) carry the guards:

```
__root.tsx                     errorComponent (bare 500), notFoundComponent (bare 404)
_public.tsx                    beforeLoad: authenticated → redirect '/'
  _public.login.tsx            /login
_auth.tsx                      requireAuth; errorComponent + notFoundComponent (with shell)
  _auth.index.tsx              /
  _auth.forbidden.tsx          /forbidden
  _auth.devices.tsx            requirePermission(DEVICE_VIEW)
    _auth.devices.index.tsx    /devices
    _auth.devices.$id.tsx      detail layout with tabs; loader fetches the device
      _auth.devices.$id.index.tsx      /devices/:id
      _auth.devices.$id.settings.tsx   /devices/:id/settings — requirePermission(DEVICE_WRITE)
  _auth.admin.tsx              requirePermission(USER_MANAGE)
    _auth.admin.users.tsx      /admin/users
```

`_auth` adds no URL segment but wraps everything beneath it. **Guards compose by nesting**: `/admin/users` inherits the auth check from `_auth` and the `user.manage` check from `_auth.admin` without restating either. A new file under `admin/` is protected the moment it exists — the classic failure mode of hand-rolled `<ProtectedRoute>` wrappers (forgetting to wrap one) becomes structurally impossible.

`/forbidden`, and the `_auth`-level 404 and error components, live **inside** the authenticated shell so a denied user still has the sidebar to navigate away with. A bare full-page 403 is a dead end.

### 8.2 Execution order

`beforeLoad` runs top-down through the matched tree, and a thrown `redirect` short-circuits all children. `beforeLoad` also runs **before** `loader`, so an unauthorized user never fires the data request — no server-side 403 is generated just to be discarded, and no partial page renders before the redirect.

### 8.3 Context and guard factories

Context holds a *reference* to the store, not a snapshot, so guards always read current state:

```ts
export const router = createRouter({
  routeTree,
  context: { getAuth: () => authStore.getState(), queryClient },
})
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
```

```ts
export const requireAuth = ({ context, location }: GuardArgs) => {
  if (context.getAuth().status !== 'authenticated')
    throw redirect({ to: '/login', search: { redirect: location.href } })
}

export const requirePermission = (...need: Permission[]) =>
  ({ context }: GuardArgs) => {
    const { permissions } = context.getAuth()
    if (!need.every(p => permissions.has(p))) throw redirect({ to: '/forbidden' })
  }

export const requireAnyPermission = (...need: Permission[]) => /* .some() */
```

Injecting `getAuth` through context (rather than importing the store directly) is what makes guards testable as plain functions: pass a fake, assert the thrown redirect. No router, DOM, or React needed.

### 8.4 Reacting to auth changes

Guards only re-run on navigation, so a logout while sitting on a page would go unnoticed. Bootstrap subscribes once:

```ts
authStore.subscribe((s, prev) => {
  if (s.status !== prev.status || s.permissions !== prev.permissions) router.invalidate()
})
```

`router.invalidate()` re-runs `beforeLoad` for the current match; the guard throws and the redirect happens. **Logout therefore needs no manual `navigate()` call anywhere** — it falls out of the guard chain. A permission *gain* is handled by the same path.

### 8.5 Error and not-found handling

**404, two kinds:**

- Bad URL (`/dvices`) — no route matches → `__root` `notFoundComponent`, bare shell
- Missing resource (`/devices/9999`) — the loader calls `throw notFound()` → `_auth` `notFoundComponent`, rendered **inside the layout with the sidebar intact**

**Errors, three tiers:**

1. `_auth` `errorComponent` — loader/render throws; keeps the shell; retry resets the boundary and re-runs the loader
2. `__root` `errorComponent` — anything escaping above `_auth`; bare full-page error
3. `<AppErrorBoundary>` (`modules/global/components/`), rendered in `main.tsx` **outside** `RouterProvider` — catches failures in provider or router construction, which would otherwise be a white screen because no router exists to render an error route

**Escalation rule:** route loaders `throw` (so failures become error pages), while component-level `useQuery` renders its error **inline** in the panel that failed. Otherwise one flaky widget destroys the whole page.

### 8.6 Navigation manifest

The sidebar is generated from `config/nav.ts` — `{ to, label, permission }[]` — filtered through `can()`. One place to edit, and the sidebar cannot drift out of sync with the guards. Filtering is cosmetic only; guards remain authoritative, because a user can always type a URL.

### 8.7 Search params

`?redirect=` is validated with a zod `validateSearch` schema and **restricted to same-origin relative paths**. An unvalidated redirect param is an open-redirect usable for phishing.

## 9. Login page (`_public.login.tsx`)

- `_public`'s `beforeLoad` bounces authenticated users to `/`
- Flow: submit → `POST /auth/login` returns `{ accessToken, refreshToken }` → `setTokens(...)` persists both → the access token is decoded (`lib/auth/jwt.ts`) for identity and roles → populate `authStore` → navigate to `search.redirect ?? '/'`. There is exactly one code path that produces a session — decoding the access token the login response itself returned — so nothing can disagree with it
- react-hook-form + zod schema (email format, password non-empty)
- Errors: `401` → one **form-level** message ("email or password is incorrect"), never field-specific, because field-specific errors confirm which accounts exist; `429` → rate-limit message; network error → retry banner
- Submit disabled while pending, so double-submit cannot fire two logins
- Real `<label>`s, `autoComplete="email"` / `"current-password"`, Enter submits

## 10. MQTT (`src/lib/mqtt/`)

### 10.1 Transport

MQTT.js in the browser speaks **MQTT over WebSocket only** — `wss://host:8084/mqtt`, never `mqtt://host:1883`. The broker must expose a WebSocket listener (Mosquitto: `listener 9001` + `protocol websockets`; EMQX: `8083`/`8084` by default).

### 10.2 Authentication

**The FE passes the access token to the broker as the MQTT password.** There is no session
cookie under Bearer auth, so nothing rides the WebSocket upgrade automatically anymore — the
frontend has to hand the broker a credential explicitly, the same way it hands the API one:

```ts
const token = getAccessToken()
mqtt.connect(env.MQTT_URL, {
  clientId,
  username: 'jwt',
  password: token ?? undefined,
  clean: true,
  keepalive: 30,
  connectTimeout: 10_000,
  transformWsUrl: (url, opts) => {
    opts.password = getAccessToken() ?? undefined
    return url
  },
})
```

`username: 'jwt'` is a fixed marker the broker's auth hook uses to recognize a JWT-bearer
connection rather than a plain username/password pair; the token itself is the secret.
`transformWsUrl` runs synchronously just before every (re)connect attempt, so it re-reads
`tokenStore.getAccessToken()` each time — a reconnect that happens after an HTTP-side token
refresh picks up the *current* token instead of the one captured at first connect. This is
the one place in the codebase where a token is read outside `lib/http/client.ts`, and it goes
through the same `tokenStore` choke point as everywhere else.

Authentication still stays in the backend/broker, not the frontend permission layer. Two
deployment shapes support this, and **the frontend code is identical for both**, so the
choice remains a backend/infrastructure decision:

1. **The broker asks the BE.** EMQX and HiveMQ support an HTTP authentication hook: on
   connect, the broker calls a URL the BE hosts, forwarding the username/password (the JWT),
   and the BE verifies the token's signature and answers allow/deny plus the topic ACL.
2. **The BE or a proxy terminates the WebSocket** and validates the JWT itself before
   relaying to the broker. Works with any broker, including plain Mosquitto configured with a
   plugin that checks the password against the BE's public key or a shared secret.

Only `VITE_MQTT_URL` and the broker's auth-hook configuration differ between them.

**Session expiry mid-connection:** an established MQTT connection persists even past the
token's `exp`, so the broker will not notice expiry on its own unless it re-checks
periodically. The next reconnect's handshake sends whatever `transformWsUrl` produces, which
is stale only if the HTTP-side refresh has also failed — in the common case a refreshed
token is already in storage by the time a reconnect happens, and the connection badge goes
offline only if it is not.

### 10.3 Lifecycle

Tied to **auth status, not app mount**:

- `authStore.status === 'authenticated'` → connect
- logout or a failed refresh → `client.endAsync()`, drop all subscriptions

Leaving the socket open after logout means the previous user's tab keeps receiving telemetry — the same class of leak as a non-cleared Query cache.

### 10.4 Connection options

- **`clientId` unique per tab**: `${userId}-${crypto.randomUUID().slice(0, 8)}` (no extra dependency needed). Brokers evict an existing session when a client reconnects with the same ID, so a shared clientId makes two open tabs disconnect each other in an infinite loop.
- **`clean: true`.** A browser is not a durable subscriber. A persistent session makes the broker queue messages for tabs that closed days ago, producing a flood on reconnect.
- **Backoff** by mutating `client.options.reconnectPeriod` inside the `reconnect` handler. MQTT.js supports only a fixed period; growing it manually is the standard way to avoid hammering a broker that is down.
- `keepalive` and `connectTimeout` set explicitly.

### 10.5 Topics and payloads

```ts
export const TOPICS = {
  deviceTelemetry: (id: string) => `devices/${id}/telemetry`,
  deviceStatus:    (id: string) => `devices/${id}/status`,
  alerts:          ()           => `alerts/#`,
} as const
```

**Every payload is zod-parsed on receipt. A parse failure drops the message with a counter and a dev warning — it never throws.** Payloads are raw bytes from physical devices, and malformed firmware output is inevitable. A throw inside the message handler escapes React's error boundaries entirely (it is not in a render path) and can take down the connection loop.

**QoS:** telemetry at QoS 0 (high-frequency and lossy-tolerant — a dropped reading is replaced 100 ms later); commands and config writes at QoS 1 (delivery matters); QoS 2 unused, as its two-phase overhead rarely earns its cost in a browser.

**Retained messages:** subscribing to `devices/+/status` populates the device-status panel instantly with last-known state, with no REST call.

`useMqttSubscription(topic, handler)` checks `can()` before subscribing and unsubscribes on unmount. The **broker topic ACL is the real enforcement**; the FE check prevents accidents only.

### 10.6 Telemetry batching

50 devices at 10 Hz is 500 store writes per second, which naively means 500 React renders.

1. Incoming messages land in a **mutable buffer outside React** (a `Map`), coalescing to the latest value per topic
2. A single `requestAnimationFrame` loop flushes the buffer into Zustand **once per frame**, capping render rate at ~60/s regardless of message rate
3. Charted series use a **fixed-size ring buffer** (last N points), so memory is bounded instead of an array growing until the tab dies
4. Components read through **selectors**, so one device's reading re-renders one panel

`rAF` pauses in background tabs, so a hidden tab stops doing work for free.

## 11. State ownership

| State | Owner | Rationale |
|---|---|---|
| session, user, permissions | Zustand `authStore` | read synchronously by guards; not a server query |
| REST data (devices, users, config) | TanStack Query | caching, invalidation, refetch |
| live telemetry, online status | Zustand `telemetryStore` | high-frequency push, not request/response |
| MQTT connection status | Zustand `mqttStore` | small; drives the connection badge |
| UI state (sidebar, modals) | Zustand `uiStore` / local | trivial |
| form state | react-hook-form | local to the form |

**The MQTT/Query line:** telemetry never touches the Query cache. But an *event* meaning "the device list changed" (device registered or deleted) **does** call `queryClient.invalidateQueries({ queryKey: ['devices'] })`, because that is a statement about REST data rather than a reading.

> **Events may invalidate Query; telemetry goes to Zustand.**

## 12. Testing

### 12.1 Unit / integration (Vitest + RTL + jsdom)

No MSW. Two hand-rolled doubles live in `src/test/`:

- **`http.ts`** — installs a `vi.fn()` on `globalThis.fetch` backed by a route table. Helpers: `mockRoute(method, path, responder)` and `callCount(path)`. Request counting is what makes the refresh-race test possible.
- **`fakeMqtt.ts`** — implements the subset of `MqttClient` the app uses (`on`, `subscribeAsync`, `publishAsync`, `endAsync`) plus `emitMessage(topic, payload)` to drive tests. Injected via a factory parameter on the mqtt client module, so tests use dependency injection rather than module mocking.

**Required test targets:**

*RBAC*
- `resolvePermissions` unions permissions across multiple roles
- an unrecognised role is ignored and does not throw
- `can` / `canAll` / `canAny` truth tables

*Guards*
- `requireAuth` throws `redirect` to `/login` carrying the current path
- `requireAuth` passes when authenticated
- `requirePermission` throws to `/forbidden` when any permission is missing
- `requireAnyPermission` passes when one of several is held

*HTTP*
- every request carries `Authorization: Bearer <accessToken>` when a token is stored, and no header when it isn't
- two concurrent 401s trigger **exactly one** `/auth/refresh` (assert `callCount === 1`)
- a replayed request is retried **once**, never twice, and uses the rotated access token
- a 401 on an `/auth/*` path does not trigger the interceptor
- refresh failure calls `clearTokens()`, clears the store, clears the Query cache, and redirects to login
- a 403 triggers a forced `/auth/refresh` (`resyncSession`) rather than an `/auth/me` refetch

*Auth store / tokenStore / jwt*
- bootstrap maps a valid / absent-or-undecodable / expired-with-successful-refresh /
  expired-with-401-refresh / expired-with-network-error token to `authenticated` /
  `unauthenticated` / `authenticated` / `unauthenticated` / `bootstrapError`
- logout calls `clearTokens()`, `queryClient.clear()`, and ends the MQTT connection
- `decodeJwt` returns `null` (never throws) for each malformed shape: wrong segment count, bad
  base64, non-JSON payload, and a payload missing a required claim
- `tokenStore` degrades to `null`/no-op rather than throwing when `localStorage` itself throws

*MQTT*
- connects only when authenticated; disconnects on logout
- `clientId` differs across two client instances
- a malformed payload is dropped without throwing, and increments the counter
- N buffered messages for one topic produce **one** store commit per frame
- the ring buffer never exceeds its configured length
- `useMqttSubscription` does not subscribe without the required permission

*Components*
- `<Can>` renders children when permitted, and `fallback` when not
- the nav manifest filters to the correct items per role
- the login form shows a form-level (not field-level) error on 401
- the login submit button is disabled while pending

**Coverage:** v8 provider, with thresholds enforced on `src/lib/**` (the reusable core). Demo features under `src/modules/**` are excluded from thresholds.

### 12.2 E2E (Playwright)

Runs against `vite preview`. REST is stubbed with `page.route()` fulfilments; a login fulfilment
returns `{ accessToken, refreshToken }` in the JSON body (there is no `Set-Cookie` to stub
under Bearer auth — the token pair itself is what a fixture constructs, typically the same
hand-signed-JWT helper pattern the unit tests use). MQTT uses the fake transport, selected by
`VITE_MQTT_TRANSPORT=fake`, which exposes a `window.__mqttFake.emit(topic, payload)` test hook
**only** under that flag.

**Specs** (the previous cookie-auth specs were deleted as part of the Bearer migration and are
pending regeneration against the fixtures above; the list of scenarios they should cover is
unchanged):

- login succeeds and lands on the dashboard
- login with bad credentials shows the form-level error and stays put
- deep link to `/devices/1` while logged out → `/login?redirect=...` → bounces back after login
- a `viewer` does not see the Admin nav item
- a `viewer` navigating directly to `/admin/users` lands on `/forbidden` with the sidebar intact
- an `operator` can open `/devices/1/settings`; a `viewer` cannot
- an unknown URL renders the 404 page
- `/devices/9999` renders the resource-not-found state inside the shell
- logout returns to login, and browser Back does not restore the authenticated page
- an injected fake telemetry message updates the device panel
- (new) an access token nearing/at expiry causes a visible refresh round-trip without
  disrupting the user's action, exercisable by pointing the spec's mock login at a very short
  `exp`

### 12.3 CI (GitHub Actions)

One workflow: lint → typecheck → unit tests with coverage → build → Playwright. Typecheck runs against the **committed** `routeTree.gen.ts`, and a step asserts the file is current (regenerate, then `git diff --exit-code`) so a stale tree cannot merge.

## 13. Tooling and configuration

- Vite, React 19, TypeScript `strict`, path alias `@/* → src/*`
- ESLint 9 flat config: typescript-eslint, react-hooks, jsx-a11y, import ordering, and a `no-restricted-imports` rule blocking cross-feature deep imports
- Prettier; Husky pre-commit running lint-staged
- Tailwind, with `modules/global/components/` primitives: Button, Input, Label, Table, Modal, Spinner, Badge
- `.env.example`: `VITE_API_URL` (an absolute URL — `http://localhost:8080` by default, pointing straight at `mock-api/server.mjs`; same-origin is no longer required since Bearer tokens are attached by application code, not the browser), `VITE_MQTT_URL`, `VITE_MQTT_TRANSPORT`. Parsed and validated once through a zod schema in `config/env.ts`, so a missing variable fails at startup with a clear message rather than as `undefined` deep inside a module.
- Vite dev proxy `/api` → BE is still available (`vite.config.ts`, defaulting its target to `http://localhost:8080`) for a deployment that prefers same-origin `/api`; it is optional under Bearer auth rather than load-bearing the way it was for `SameSite=Lax` cookies
- `docker-compose.yml` with Mosquitto (WebSocket listener enabled) for local development

## 14. BE contract

Endpoints the FE requires. A dependency-free reference implementation ships at
`mock-api/server.mjs` (see the root `README.md`) so this contract is directly runnable rather
than only documented.

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `200 { accessToken, refreshToken }` / `401` |
| POST | `/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` / `401` |
| POST | `/auth/logout` | — | `204` (best-effort; there is nothing server-side to invalidate in a stateless-JWT design unless the BE keeps a denylist) |
| GET | `/devices` | `Authorization: Bearer <accessToken>` | `200 Device[]` / `401` |
| GET | `/devices/:id` | `Authorization: Bearer <accessToken>` | `200 Device` / `404` / `401` |
| PATCH | `/devices/:id` | `Authorization: Bearer <accessToken>` + partial `Device` | `200 Device` / `403` (needs `admin` or `operator`) / `401` |
| DELETE | `/devices/:id` | `Authorization: Bearer <accessToken>` | `204` / `403` (needs `admin`) / `401` |
| GET | `/users` | `Authorization: Bearer <accessToken>` | `200 User[]` / `403` (needs `admin`) / `401` |

There is no `GET /auth/me` — the FE derives identity and roles from the access token's own
claims (§7.1, §3.1).

**JWT claims required:** `sub`, `email`, `name`, `roles: string[]`, `exp` (Unix seconds), at
minimum, on the access token. The refresh token only needs to be verifiable and to identify
the user server-side; the FE never decodes it.

**Access token TTL is a live operational knob, not just a security parameter.** Short-lived
access tokens are what make the reactive-refresh design exercisable in manual testing — the
mock API's `ACCESS_TTL_SECONDS` (default 900) is meant to be turned down (e.g. to `30`) so
the refresh interceptor visibly fires.

**Server-side authorization is the actual boundary, not a nicety of the mock.** §4 says the
FE permission layer is UX; the mock API enforces the real check (role -> permission mapping
matching `src/lib/rbac/permissions.ts` exactly) precisely so a demo of this base proves that
boundary rather than merely asserting it in prose.

**Broker requirements:** a WebSocket listener, and authentication via the access token passed
as the MQTT password (§10.2) — either the broker's HTTP auth hook verifying the JWT, or a
BE/proxy-terminated WebSocket that does. Topic ACLs are keyed to the verified token's claims,
not to network position, so same-site is no longer a broker requirement the way it was for
cookie auth.

## 15. Assumptions

1. Roles are flat strings with no hierarchy or inheritance.
2. The frontend accepts the XSS-exposure trade-off of `localStorage`-held Bearer tokens,
   documented plainly in §3.1, in exchange for not needing FE/BE same-site cookie plumbing.
   A deployment that cannot accept that trade changes only `lib/auth/tokenStore.ts`.
3. The broker exposes MQTT over WebSocket, and its auth hook (or a terminating proxy) can
   verify a JWT passed as the connection password.
4. `POST /auth/login` and `POST /auth/refresh` both return a fresh `{ accessToken,
   refreshToken }` pair as JSON. The access token's own claims are the only source of user
   identity and roles — there is no `GET /auth/me`.
5. CORS is the BE's responsibility whenever the FE origin differs from the API origin, since
   Bearer requests are not simple requests and the browser will preflight mutating ones. The
   mock API's permissive CORS for `http://localhost:5173` is a manual-testing convenience,
   not a production CORS policy.

## 16. Demo slice

Three roles — `admin`, `operator`, `viewer` — exercising `/login`, `/` (dashboard with a live telemetry panel), `/devices`, `/devices/:id`, `/devices/:id/settings` (gated on `device.write`), `/admin/users` (gated on `user.manage`), `/forbidden`, 404, and the error state.

The devices list carries a row-level delete button wrapped in `<Can permission="device.delete">`. This is deliberate: it is the demo's only use of **element-level** gating, as distinct from the route-level gating everywhere else, and it is what makes `DEVICE_DELETE` a used permission rather than a dead declaration. `admin` sees the button; `operator` and `viewer` do not.

Deleting `src/modules/*`, the `_auth.devices.*` and `_auth.admin.*` routes, and the nav manifest entries leaves the reusable base intact.

`mock-api/server.mjs` seeds exactly these three accounts (all with password `password`) and
enforces the matching permissions server-side, so this slice is runnable end to end —
`npm run dev:all` — rather than only described. See the root `README.md` for the walkthrough.
