# React Base — Design Spec

**Date:** 2026-09-07
**Status:** Approved (design), pending implementation plan

## 1. Overview

A reusable React application base, built on Vite, for internal IoT device-management front ends. It ships six cross-cutting capabilities as first-class, tested modules:

1. **Phân quyền (RBAC)** — role-based permissions, resolved on the FE from roles sent by the BE
2. **Routing / sub-routing** — nested, type-safe routes with guards that compose by nesting
3. **Auth** — HttpOnly cookie sessions with reactive token refresh
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
| Auth transport | **JWT** access + refresh tokens, both HttpOnly cookies set by BE |
| Token visibility | **The FE never touches, stores, or sees a token string** — no exceptions, including for the MQTT broker |
| User data source | **`GET /auth/me` is the only source of user identity and roles** — no other response body supplies them |
| Session bootstrap | `GET /auth/me` before the router mounts |
| Token refresh | Reactive, on 401, single-flight, replay once |
| Cookie scope | Designed for same-site (`SameSite=Lax`); CSRF module is a one-file opt-in |
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

### 3.1 On JWTs specifically

The backend authenticates with **JWTs**. They are carried in HttpOnly cookies, so the
frontend never reads, parses, stores, or forwards them — it only sends
`credentials: 'include'` and lets the browser attach the cookie.

These two facts are not in tension, and it is worth stating plainly because the
combination is easy to misread in both directions:

- "The FE never sees a token" does **not** mean the system avoids JWTs. It means the
  JWT is invisible to frontend code.
- Because the token is invisible, the frontend cannot tell whether a cookie carries a
  JWT or an opaque session id. That is a property, not a gap: the backend can change
  its token format without a single frontend change.

Practical consequences of the frontend never reading the JWT:

- No `Authorization` header is ever set (there is a test asserting its absence).
- Refresh is **reactive**, not scheduled — the frontend cannot decode an expiry, so it
  refreshes on a `401` rather than ahead of one (§7.3).
- Identity and roles come from `GET /auth/me`, not from decoding the token (§7.1).
- The MQTT broker gets no credential from the frontend either; the session cookie
  rides the WebSocket upgrade (§10.2).

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
  app/                    providers, router construction, bootstrap, error boundary
  routes/                 TanStack Router file-based tree (thin; imports from modules)
  lib/                    cross-cutting infrastructure — the reusable core
    rbac/                 permissions.ts, resolve.ts, predicates.ts, guards.ts, <Can>, usePermissions
    auth/                 authStore, service (bootstrap/login/logout), safeRedirect
    http/                 apiFetch, refresh single-flight, csrf (opt-in)
    mqtt/                 topics, client, connectionStore, batcher, telemetryStore, useMqttSubscription
  modules/                feature modules — each owns its api, queries, components
    global/
      components/         shared components: Tailwind primitives + AppShell
    auth/                 LoginForm
    devices/              api, queries, useDeviceEvents, components/
    users/                api, queries
  config/                 nav manifest, env parsing
  test/                   setup, fetch stub helper, fake mqtt client, render helpers
e2e/                      Playwright specs + fixtures
docs/superpowers/specs/   this document
```

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

Because both tokens are HttpOnly, the FE knows nothing on page load. `app/bootstrap` calls `GET /auth/me` **once, before `RouterProvider` mounts**, and seeds the auth store. Guards therefore never run against an unknown session, which eliminates redirect flicker and guard races.

**Bootstrap has three outcomes, not two:**

| Response | State |
|---|---|
| `200` | `authenticated` — user + resolved permissions in the store |
| `401` | `unauthenticated` — router mounts, guards send the user to `/login` |
| network error / `5xx` | **`bootstrapError`** — full-page "cannot reach server" with retry |

The third case is mandatory. Treating a BE outage as "unauthenticated" silently logs out every user and strands them on a login page that also cannot work.

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

A single `apiFetch` wrapper, always `credentials: 'include'`. No `Authorization` header is ever set — the FE cannot read the tokens.

On `401`:

1. Join a **module-level single-flight promise**, so N concurrent 401s produce exactly one `POST /auth/refresh`
2. On success, replay each original request **exactly once**, tracked by a per-request retry counter so a misbehaving BE cannot cause an infinite loop
3. On failure, clear the auth store, call `queryClient.clear()`, and redirect to `/login?redirect=<current>`

`/auth/*` paths are exempt from the interceptor entirely; without this, a failing refresh recurses.

On `403`: refetch `GET /auth/me` to resync permissions (this covers a role change made on the BE mid-session). Re-running the guards is *not* done here — updating the store triggers the subscription in section 8.4, which invalidates the router. One mechanism, one place.

### 7.4 Logout

`POST /auth/logout` (the BE clears the cookies — the FE cannot), then reset the auth store, `client.endAsync()` the MQTT connection, and call **`queryClient.clear()`**.

Clearing the Query cache is not optional: without it, a second user logging in on the same tab sees the first user's cached device list. That is a permission leak.

### 7.5 CSRF

`http/csrf.ts` ships as a single opt-in interceptor: it reads a non-HttpOnly `XSRF-TOKEN` cookie and sets `X-XSRF-TOKEN` on mutating methods. Disabled by default (same-site `Lax` covers it); enabled by one env flag if the deployment becomes cross-domain. Cross-domain additionally requires the BE to set `SameSite=None; Secure` and CORS with `Allow-Credentials` plus an explicit origin.

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
3. `<AppErrorBoundary>` in `app/`, **outside** `RouterProvider` — catches failures in provider or router construction, which would otherwise be a white screen because no router exists to render an error route

**Escalation rule:** route loaders `throw` (so failures become error pages), while component-level `useQuery` renders its error **inline** in the panel that failed. Otherwise one flaky widget destroys the whole page.

### 8.6 Navigation manifest

The sidebar is generated from `config/nav.ts` — `{ to, label, permission }[]` — filtered through `can()`. One place to edit, and the sidebar cannot drift out of sync with the guards. Filtering is cosmetic only; guards remain authoritative, because a user can always type a URL.

### 8.7 Search params

`?redirect=` is validated with a zod `validateSearch` schema and **restricted to same-origin relative paths**. An unvalidated redirect param is an open-redirect usable for phishing.

## 9. Login page (`_public.login.tsx`)

- `_public`'s `beforeLoad` bounces authenticated users to `/`
- Flow: submit → `POST /auth/login` → BE sets both cookies and returns `204` with **no body** → `GET /auth/me` supplies the user and roles → populate `authStore` → navigate to `search.redirect ?? '/'`. The login response deliberately carries no user data, so there is no second code path that could disagree with `/auth/me`
- react-hook-form + zod schema (email format, password non-empty)
- Errors: `401` → one **form-level** message ("email or password is incorrect"), never field-specific, because field-specific errors confirm which accounts exist; `429` → rate-limit message; network error → retry banner
- Submit disabled while pending, so double-submit cannot fire two logins
- Real `<label>`s, `autoComplete="email"` / `"current-password"`, Enter submits

## 10. MQTT (`src/lib/mqtt/`)

### 10.1 Transport

MQTT.js in the browser speaks **MQTT over WebSocket only** — `wss://host:8084/mqtt`, never `mqtt://host:1883`. The broker must expose a WebSocket listener (Mosquitto: `listener 9001` + `protocol websockets`; EMQX: `8083`/`8084` by default).

### 10.2 Authentication

**The FE passes no credential to the broker.** The WebSocket upgrade is an HTTP request, so the browser attaches the session cookie to it automatically — exactly as it does for REST. The frontend simply connects:

```ts
mqtt.connect(env.MQTT_URL, { clientId, clean: true, keepalive: 30, connectTimeout: 10_000 })
```

No username, no password, no credential fetch, no token of any kind. This satisfies the absolute rule in §3: the frontend never sees a token string, and the MQTT broker is not an exception to it.

Authentication stays in the backend. Two deployment shapes support this, and **the frontend code is identical for both**, so the choice is a backend/infrastructure decision that does not affect this codebase:

1. **The broker asks the BE.** EMQX and HiveMQ support an HTTP authentication hook: on connect, the broker calls a URL the BE hosts, forwarding the cookie, and the BE answers allow/deny plus the topic ACL.
2. **The BE or a proxy terminates the WebSocket.** The FE connects to `wss://<app origin>/mqtt`; nginx `auth_request` or the API authenticates the cookie like any other request, then relays to the broker. Works with any broker, including plain Mosquitto.

Only `VITE_MQTT_URL` differs between them.

**Session expiry mid-connection:** an established MQTT connection persists, so the broker will not notice a session expiring. The next reconnect's handshake fails and the connection badge goes offline — correct, and visible to the user.

This design is also *less* code than a credential-passing one: there is no credential cache, no expiry tracking, and no `transformWsUrl` hook, because the browser resends the cookie on every reconnect automatically.

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
- two concurrent 401s trigger **exactly one** `/auth/refresh` (assert `callCount === 1`)
- a replayed request is retried **once**, never twice
- a 401 on an `/auth/*` path does not trigger the interceptor
- refresh failure clears the store, clears the Query cache, and redirects to login
- a 403 triggers a `/auth/me` refetch

*Auth store*
- bootstrap maps 200 / 401 / network error to `authenticated` / `unauthenticated` / `bootstrapError`
- logout calls `queryClient.clear()` and ends the MQTT connection

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

Runs against `vite preview`. REST is stubbed with `page.route()` fulfilments, including `Set-Cookie` headers so the cookie flow is genuinely exercised. MQTT uses the fake transport, selected by `VITE_MQTT_TRANSPORT=fake`, which exposes a `window.__mqttFake.emit(topic, payload)` test hook **only** under that flag.

**Specs:**

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

### 12.3 CI (GitHub Actions)

One workflow: lint → typecheck → unit tests with coverage → build → Playwright. Typecheck runs against the **committed** `routeTree.gen.ts`, and a step asserts the file is current (regenerate, then `git diff --exit-code`) so a stale tree cannot merge.

## 13. Tooling and configuration

- Vite, React 19, TypeScript `strict`, path alias `@/* → src/*`
- ESLint 9 flat config: typescript-eslint, react-hooks, jsx-a11y, import ordering, and a `no-restricted-imports` rule blocking cross-feature deep imports
- Prettier; Husky pre-commit running lint-staged
- Tailwind, with `modules/global/components/` primitives: Button, Input, Label, Table, Modal, Spinner, Badge
- `.env.example`: `VITE_API_URL` (defaults to the relative `/api` so the dev proxy keeps localhost same-origin; set to an absolute URL only for a cross-domain deployment), `VITE_MQTT_URL`, `VITE_ENABLE_CSRF`, `VITE_MQTT_TRANSPORT`. Parsed and validated once through a zod schema in `config/env.ts`, so a missing variable fails at startup with a clear message rather than as `undefined` deep inside a module.
- Vite dev proxy `/api` → BE, making localhost same-origin so `SameSite=Lax` cookies work in development
- `docker-compose.yml` with Mosquitto (WebSocket listener enabled) for local development

## 14. BE contract

Endpoints the FE requires:

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `204` **no body** + `Set-Cookie` (access, refresh) |
| POST | `/auth/refresh` | — (reads refresh cookie) | `200` + `Set-Cookie` (new access) / `401` |
| POST | `/auth/logout` | — | `204`, clears both cookies |
| GET | `/auth/me` | — | `200 { user }` / `401` |
| GET | `/devices` | — | `200 Device[]` |
| GET | `/devices/:id` | — | `200 Device` / `404` |
| PATCH | `/devices/:id` | partial `Device` | `200 Device` |
| GET | `/users` | — | `200 User[]` |

**Cookie flags required:** `HttpOnly; Secure; SameSite=Lax; Path=/`. `HttpOnly` is the entire point — without it there is no advantage over `localStorage`.

**Broker requirements:** a WebSocket listener, and authentication delegated to the BE per §10.2 — either the broker's HTTP auth hook or a BE/proxy-terminated WebSocket. Topic ACLs are keyed to the authenticated session, not to any credential the FE holds. The broker endpoint must be same-site with the API so the browser attaches the session cookie to the upgrade request.

## 15. Assumptions

1. Roles are flat strings with no hierarchy or inheritance.
2. FE and BE are same-site in production. If this changes, the BE must switch to `SameSite=None; Secure` with credentialed CORS, and `VITE_ENABLE_CSRF` must be turned on.
3. The broker exposes MQTT over WebSocket.
4. `POST /auth/login` returns `204` with no body. `GET /auth/me` is the only endpoint supplying user identity and roles.
5. The broker receives the session cookie on the WebSocket upgrade and delegates authentication to the BE (§10.2). This requires the broker endpoint to be same-site with the API.

## 16. Demo slice

Three roles — `admin`, `operator`, `viewer` — exercising `/login`, `/` (dashboard with a live telemetry panel), `/devices`, `/devices/:id`, `/devices/:id/settings` (gated on `device.write`), `/admin/users` (gated on `user.manage`), `/forbidden`, 404, and the error state.

The devices list carries a row-level delete button wrapped in `<Can permission="device.delete">`. This is deliberate: it is the demo's only use of **element-level** gating, as distinct from the route-level gating everywhere else, and it is what makes `DEVICE_DELETE` a used permission rather than a dead declaration. `admin` sees the button; `operator` and `viewer` do not.

Deleting `src/modules/*`, the `_auth.devices.*` and `_auth.admin.*` routes, and the nav manifest entries leaves the reusable base intact.
