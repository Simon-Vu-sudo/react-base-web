# React Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Vite + React 19 application base for internal IoT device-management front ends, with role-based permissions, nested route guards, HttpOnly-cookie auth, MQTT telemetry, and both unit and E2E test layers.

**Architecture:** Feature-first layout — cross-cutting infrastructure lives in `src/lib` (`rbac`, `auth`, `http`, `mqtt`), demo domains in `src/modules`, and a thin TanStack Router file-based tree in `src/routes` that imports from both. Permissions are resolved once at session bootstrap from roles the BE sends, into a `Set<Permission>` that guards, hooks, and components all read. Route guards compose by nesting through pathless layout routes, so a page is protected by virtue of where its file sits.

**Tech Stack:** Vite, React 19, TypeScript (strict), TanStack Router, TanStack Query, Zustand, MQTT.js, react-hook-form + zod, Tailwind, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-react-base-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **TypeScript `strict: true`.** No `any` in `src/lib/**`. Path alias `@/*` → `src/*`.
- **The FE permission layer is UX, not authorization.** Never describe or comment on route guards or `<Can>` as a security boundary. The BE endpoint and the broker topic ACL are the only real enforcement.
- **No MSW.** HTTP is stubbed by the hand-rolled helper in `src/test/http.ts`. MQTT is stubbed by the fake client in `src/test/fakeMqtt.ts`. Do not add either library.
- **Never set an `Authorization` header.** Both tokens are HttpOnly cookies the FE cannot read. Every request uses `credentials: 'include'`.
- **Permissions are flat strings.** No object/ownership context, no role hierarchy.
- **`src/routeTree.gen.ts` is committed.** Never add it to `.gitignore`.
- **The TanStack Router Vite plugin must be listed before `react()`** in the plugins array, or route generation and code splitting break.
- **zod is pinned to `^3`.** zod v4 renames `z.string().email()` to `z.email()`; every schema in this plan uses the v3 form.
- **Coverage thresholds apply to `src/lib/**` only.** `src/modules/**` is demo code and is excluded.
- **Tailwind only.** No component library. Primitives are hand-rolled in `src/modules/global/components`.
- **Commit after every task.** Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).

---

## File Structure

**Infrastructure (`src/lib`) — the reusable core, held to coverage thresholds:**

| File | Responsibility |
|---|---|
| `lib/rbac/permissions.ts` | Declares `PERMISSIONS`, `Permission`, `ROLE_PERMISSIONS`. The only place a permission name exists. |
| `lib/rbac/resolve.ts` | `resolvePermissions(roles)` → `Set<Permission>`; ignores unknown roles |
| `lib/rbac/can.ts` | `can` / `canAll` / `canAny` pure predicates |
| `lib/rbac/guards.ts` | `requireAuth`, `requirePermission`, `requireAnyPermission` route guards |
| `lib/rbac/usePermissions.ts` | Store-bound hook wrapping the predicates |
| `lib/rbac/Can.tsx` | Declarative element gating |
| `lib/auth/store.ts` | `authStore` — status, user, permissions |
| `lib/auth/service.ts` | `bootstrap`, `login`, `logout` |
| `lib/http/client.ts` | `apiFetch` + single-flight refresh + replay |
| `lib/http/csrf.ts` | Opt-in `XSRF-TOKEN` → `X-XSRF-TOKEN` interceptor |
| `lib/mqtt/topics.ts` | Topic builders + zod payload schemas |
| `lib/mqtt/credentials.ts` | Credential cache with proactive refresh |
| `lib/mqtt/client.ts` | Connection manager, DI factory, lifecycle |
| `lib/mqtt/batcher.ts` | rAF-batched buffer + ring buffer |
| `lib/mqtt/telemetryStore.ts` | Zustand store for live readings |
| `lib/mqtt/useMqttSubscription.ts` | Component-scoped subscribe with permission check |

**App wiring (`src/app`, `src/config`):** `app/queryClient.ts`, `app/router.tsx`, `app/AppErrorBoundary.tsx`, `app/bootstrap.tsx`, `config/env.ts`, `config/nav.ts`.

**Routes (`src/routes`) — thin; all logic imported.** Tree as laid out in spec §8.1.

**Features (`src/modules`) — deletable demo:** `modules/devices/{api,hooks,components}`, `modules/users/{api,hooks,components}`.

**Test doubles (`src/test`):** `setup.ts`, `http.ts`, `fakeMqtt.ts`, `render.tsx`.

Split rationale: `rbac` separates *declaration* (`permissions.ts`) from *resolution* (`resolve.ts`) from *predicates* (`can.ts`) so the pure logic is testable with no React and no store. `mqtt` separates the *transport* (`client.ts`) from the *rate control* (`batcher.ts`) from the *storage* (`telemetryStore.ts`), because the batching is the part most likely to need tuning and it should be tunable without touching connection code.

---

## Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/index.css`, `src/test/setup.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.env.example`
- Test: `src/test/harness.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `npm run dev` / `npm test` / `npm run build` / `npm run lint` / `npm run typecheck`; path alias `@/*`; Tailwind available via `src/index.css`

- [ ] **Step 1: Initialize package.json and install dependencies**

Installing with `@latest` rather than hand-written version ranges, so npm resolves a mutually compatible set. zod is the one deliberate pin.

```bash
npm init -y
npm pkg set name="react-base" private=true type="module"

npm i react@latest react-dom@latest \
  @tanstack/react-router@latest @tanstack/react-query@latest \
  zustand@latest mqtt@latest \
  react-hook-form@latest @hookform/resolvers@latest \
  zod@^3

npm i -D vite@latest @vitejs/plugin-react@latest typescript@latest \
  @types/react@latest @types/react-dom@latest \
  @tanstack/router-plugin@latest \
  tailwindcss@latest @tailwindcss/vite@latest \
  vitest@latest jsdom@latest @vitest/coverage-v8@latest \
  @testing-library/react@latest @testing-library/dom@latest \
  @testing-library/user-event@latest @testing-library/jest-dom@latest \
  eslint@latest @eslint/js@latest typescript-eslint@latest \
  eslint-plugin-react-hooks@latest eslint-plugin-jsx-a11y@latest \
  globals@latest prettier@latest
```

- [ ] **Step 2: Add npm scripts**

```bash
npm pkg set scripts.dev="vite"
npm pkg set scripts.build="tsc -b && vite build"
npm pkg set scripts.preview="vite preview"
npm pkg set scripts.typecheck="tsc -b --noEmit"
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.test:cov="vitest run --coverage"
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "e2e"]
}
```

- [ ] **Step 4: Write `vite.config.ts`**

One config serves Vite and Vitest. The router plugin comes first — the constraint from the docs, and getting it wrong produces confusing route-generation failures.

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      thresholds: {
        'src/lib/**': {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
})
```

`changeOrigin: false` is deliberate: the cookie domain must stay `localhost` so `SameSite=Lax` cookies are accepted in development.

- [ ] **Step 5: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 6: Write `index.html`, `src/index.css`, `src/main.tsx`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Base</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css` (Tailwind v4 — a single import, no config file needed):

```css
@import 'tailwindcss';
```

`src/main.tsx` — a placeholder that Task 11 replaces with the real bootstrap:

```tsx
import { createRoot } from 'react-dom/client'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root not found')
createRoot(el).render(<div className="p-4">React Base</div>)
```

- [ ] **Step 7: Write `eslint.config.js`**

The `no-restricted-imports` rule is the structural guardrail from the spec: features may not reach into each other.

```js
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  { ignores: ['dist', 'src/routeTree.gen.ts', 'coverage', 'playwright-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*/*', '!@/modules/global/**'],
              message:
                'Do not import another feature’s internals. Promote shared code into src/lib.',
            },
          ],
        },
      ],
    },
  },
)
```

- [ ] **Step 8: Write `.prettierrc`, `.gitignore`, `.env.example`**

`.prettierrc`:

```json
{ "semi": false, "singleQuote": true, "printWidth": 100 }
```

`.gitignore` — note `src/routeTree.gen.ts` is deliberately absent:

```
node_modules
dist
coverage
playwright-report
test-results
.env
.env.local
```

`.env.example`:

```
# Relative by default so the Vite dev proxy keeps localhost same-origin
# and SameSite=Lax cookies are accepted. Absolute URL only for a
# cross-domain deployment (which also requires VITE_ENABLE_CSRF=true).
VITE_API_URL=/api
VITE_MQTT_URL=ws://localhost:9001/mqtt
VITE_ENABLE_CSRF=false
# 'real' | 'fake' — 'fake' swaps in the in-memory MQTT transport for E2E
VITE_MQTT_TRANSPORT=real
```

- [ ] **Step 9: Write the harness smoke test**

This proves the toolchain works — the alias resolves, jsdom is present, and jest-dom matchers are loaded — before any real code depends on it.

```ts
// src/test/harness.test.ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs in a DOM environment', () => {
    const el = document.createElement('div')
    el.textContent = 'ok'
    document.body.append(el)
    expect(el).toBeInTheDocument()
  })

  it('resolves the @ path alias', async () => {
    const mod = await import('@/test/setup')
    expect(mod).toBeDefined()
  })
})
```

- [ ] **Step 10: Run the full toolchain**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: tests PASS (2 tests), typecheck clean, lint clean, build emits `dist/`.

If `typecheck` fails on a missing `src/routeTree.gen.ts`, that is expected at this stage — the file appears in Task 11 when the first route exists. Until then the router plugin has nothing to generate. Confirm the other three commands pass and move on.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with test harness"
```

---

## Task 2: Environment configuration

**Files:**
- Create: `src/config/env.ts`
- Test: `src/config/env.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `env: { API_URL: string; MQTT_URL: string; ENABLE_CSRF: boolean; MQTT_TRANSPORT: 'real' | 'fake' }` and `parseEnv(raw: Record<string, unknown>)` for testing

Validating env once, at startup, so a missing variable fails loudly with a name — rather than surfacing as `undefined` inside a fetch URL three modules away.

- [ ] **Step 1: Write the failing test**

```ts
// src/config/env.test.ts
import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('parses a valid environment', () => {
    const result = parseEnv({
      VITE_API_URL: '/api',
      VITE_MQTT_URL: 'ws://localhost:9001/mqtt',
      VITE_ENABLE_CSRF: 'false',
      VITE_MQTT_TRANSPORT: 'real',
    })
    expect(result).toEqual({
      API_URL: '/api',
      MQTT_URL: 'ws://localhost:9001/mqtt',
      ENABLE_CSRF: false,
      MQTT_TRANSPORT: 'real',
    })
  })

  it('coerces the string "true" to a boolean', () => {
    const result = parseEnv({
      VITE_API_URL: '/api',
      VITE_MQTT_URL: 'ws://x/mqtt',
      VITE_ENABLE_CSRF: 'true',
      VITE_MQTT_TRANSPORT: 'fake',
    })
    expect(result.ENABLE_CSRF).toBe(true)
    expect(result.MQTT_TRANSPORT).toBe('fake')
  })

  it('defaults optional values when absent', () => {
    const result = parseEnv({ VITE_MQTT_URL: 'ws://x/mqtt' })
    expect(result.API_URL).toBe('/api')
    expect(result.ENABLE_CSRF).toBe(false)
    expect(result.MQTT_TRANSPORT).toBe('real')
  })

  it('throws naming the missing variable', () => {
    expect(() => parseEnv({})).toThrow(/VITE_MQTT_URL/)
  })

  it('rejects an unknown transport', () => {
    expect(() =>
      parseEnv({ VITE_MQTT_URL: 'ws://x/mqtt', VITE_MQTT_TRANSPORT: 'carrier-pigeon' }),
    ).toThrow(/VITE_MQTT_TRANSPORT/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/env.test.ts`
Expected: FAIL — cannot resolve `./env`

- [ ] **Step 3: Write the implementation**

```ts
// src/config/env.ts
import { z } from 'zod'

const boolish = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .default('false')

const schema = z.object({
  VITE_API_URL: z.string().min(1).default('/api'),
  VITE_MQTT_URL: z.string().min(1),
  VITE_ENABLE_CSRF: boolish,
  VITE_MQTT_TRANSPORT: z.enum(['real', 'fake']).default('real'),
})

export type Env = {
  API_URL: string
  MQTT_URL: string
  ENABLE_CSRF: boolean
  MQTT_TRANSPORT: 'real' | 'fake'
}

export function parseEnv(raw: Record<string, unknown>): Env {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration: ${names}`)
  }
  return {
    API_URL: parsed.data.VITE_API_URL,
    MQTT_URL: parsed.data.VITE_MQTT_URL,
    ENABLE_CSRF: parsed.data.VITE_ENABLE_CSRF,
    MQTT_TRANSPORT: parsed.data.VITE_MQTT_TRANSPORT,
  }
}

export const env: Env = parseEnv(import.meta.env as unknown as Record<string, unknown>)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/env.test.ts`
Expected: PASS (5 tests)

Note: importing this module in tests evaluates the `env` export against the real `import.meta.env`, so `VITE_MQTT_URL` must be present during test runs. Add it to a `.env.test` file if the run fails on it:

```bash
printf 'VITE_MQTT_URL=ws://localhost:9001/mqtt\n' > .env.test
```

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts .env.test
git commit -m "feat: add validated environment configuration"
```

---

## Task 3: RBAC core — declaration, resolution, predicates

**Files:**
- Create: `src/lib/rbac/permissions.ts`, `src/lib/rbac/resolve.ts`, `src/lib/rbac/can.ts`
- Test: `src/lib/rbac/resolve.test.ts`, `src/lib/rbac/can.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PERMISSIONS` const object; `type Permission`
  - `ROLE_PERMISSIONS: Record<string, readonly Permission[]>`
  - `resolvePermissions(roles: string[]): Set<Permission>`
  - `can(perms: ReadonlySet<Permission>, p: Permission): boolean`
  - `canAll(perms: ReadonlySet<Permission>, ps: readonly Permission[]): boolean`
  - `canAny(perms: ReadonlySet<Permission>, ps: readonly Permission[]): boolean`

The heart of the phân quyền requirement. All pure — no React, no store, no DOM.

- [ ] **Step 1: Write the declaration module**

No test of its own; it is data, and the tests below assert against it.

```ts
// src/lib/rbac/permissions.ts
export const PERMISSIONS = {
  DEVICE_VIEW: 'device.view',
  DEVICE_WRITE: 'device.write',
  DEVICE_DELETE: 'device.delete',
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS)

export const ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS,
  operator: [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE, PERMISSIONS.USER_VIEW],
  viewer: [PERMISSIONS.DEVICE_VIEW],
} satisfies Record<string, readonly Permission[]>

export type Role = keyof typeof ROLE_PERMISSIONS
```

- [ ] **Step 2: Write the failing resolution test**

The unknown-role case is the important one — spec §6.2 makes it non-fatal on purpose.

```ts
// src/lib/rbac/resolve.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { PERMISSIONS } from './permissions'
import { resolvePermissions } from './resolve'

afterEach(() => vi.restoreAllMocks())

describe('resolvePermissions', () => {
  it('maps a single role to its permissions', () => {
    expect(resolvePermissions(['viewer'])).toEqual(new Set([PERMISSIONS.DEVICE_VIEW]))
  })

  it('unions permissions across multiple roles without duplicates', () => {
    const perms = resolvePermissions(['viewer', 'operator'])
    expect(perms.has(PERMISSIONS.DEVICE_VIEW)).toBe(true)
    expect(perms.has(PERMISSIONS.DEVICE_WRITE)).toBe(true)
    expect(perms.has(PERMISSIONS.DEVICE_DELETE)).toBe(false)
    expect(perms.size).toBe(3)
  })

  it('gives admin every permission', () => {
    expect(resolvePermissions(['admin']).size).toBe(5)
  })

  it('ignores an unrecognised role instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const perms = resolvePermissions(['viewer', 'supervisor'])
    expect(perms).toEqual(new Set([PERMISSIONS.DEVICE_VIEW]))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('supervisor'))
  })

  it('returns an empty set for no roles', () => {
    expect(resolvePermissions([]).size).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/rbac/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`

- [ ] **Step 4: Write the resolution implementation**

```ts
// src/lib/rbac/resolve.ts
import { ROLE_PERMISSIONS, type Permission } from './permissions'

/**
 * Resolves the roles the BE sent into the permission set the FE enforces.
 * An unrecognised role is ignored with a dev warning, never thrown: when the
 * BE adds a role before the FE knows about it, the user should get a degraded
 * UI, not a blank screen.
 */
export function resolvePermissions(roles: readonly string[]): Set<Permission> {
  const perms = new Set<Permission>()
  for (const role of roles) {
    const mapped = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]
    if (!mapped) {
      if (import.meta.env.DEV) {
        console.warn(`[rbac] Unknown role "${role}" from the server; ignoring it.`)
      }
      continue
    }
    for (const p of mapped) perms.add(p)
  }
  return perms
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/rbac/resolve.test.ts`
Expected: PASS (5 tests)

The unknown-role test asserts `console.warn` was called, so it depends on `import.meta.env.DEV` being true. Vitest sets `DEV` true by default; if that assertion fails, drop the `if (import.meta.env.DEV)` wrapper rather than weakening the test.

- [ ] **Step 6: Write the failing predicates test**

```ts
// src/lib/rbac/can.test.ts
import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from './permissions'
import { can, canAll, canAny } from './can'

const perms = new Set([PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE])

describe('can', () => {
  it('is true for a held permission', () => {
    expect(can(perms, PERMISSIONS.DEVICE_VIEW)).toBe(true)
  })
  it('is false for a permission not held', () => {
    expect(can(perms, PERMISSIONS.USER_MANAGE)).toBe(false)
  })
})

describe('canAll', () => {
  it('is true when every permission is held', () => {
    expect(canAll(perms, [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE])).toBe(true)
  })
  it('is false when any permission is missing', () => {
    expect(canAll(perms, [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.USER_MANAGE])).toBe(false)
  })
  it('is true for an empty requirement', () => {
    expect(canAll(perms, [])).toBe(true)
  })
})

describe('canAny', () => {
  it('is true when at least one permission is held', () => {
    expect(canAny(perms, [PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW])).toBe(true)
  })
  it('is false when none are held', () => {
    expect(canAny(perms, [PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_DELETE])).toBe(false)
  })
  it('is false for an empty requirement', () => {
    expect(canAny(perms, [])).toBe(false)
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/lib/rbac/can.test.ts`
Expected: FAIL — cannot resolve `./can`

- [ ] **Step 8: Write the predicates implementation**

```ts
// src/lib/rbac/can.ts
import type { Permission } from './permissions'

export const can = (perms: ReadonlySet<Permission>, p: Permission): boolean => perms.has(p)

export const canAll = (
  perms: ReadonlySet<Permission>,
  required: readonly Permission[],
): boolean => required.every((p) => perms.has(p))

export const canAny = (
  perms: ReadonlySet<Permission>,
  required: readonly Permission[],
): boolean => required.some((p) => perms.has(p))
```

- [ ] **Step 9: Run both test files**

Run: `npx vitest run src/lib/rbac`
Expected: PASS (13 tests)

- [ ] **Step 10: Commit**

```bash
git add src/lib/rbac
git commit -m "feat: add RBAC permission declaration, resolution and predicates"
```

---

## Task 4: Auth store

**Files:**
- Create: `src/lib/auth/store.ts`
- Test: `src/lib/auth/store.test.ts`

**Interfaces:**
- Consumes: `resolvePermissions` (Task 3), `type Permission` (Task 3)
- Produces:
  - `type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrapError'`
  - `type User = { id: string; email: string; name: string; roles: string[] }`
  - `authStore` — a vanilla Zustand store (`createStore`, not the React hook) so non-React code (guards, http client) can read it
  - Actions: `setSession(user: User)`, `setUnauthenticated()`, `setBootstrapError()`
  - `useAuthStore` — the React binding

A **vanilla** store is used deliberately: `lib/http/client.ts` and `lib/rbac/guards.ts` both need `getState()` outside of React.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth/store.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { authStore } from './store'

const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['operator'] }

beforeEach(() => authStore.getState().setUnauthenticated())

describe('authStore', () => {
  it('starts unauthenticated with no user and no permissions', () => {
    const s = authStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(s.permissions.size).toBe(0)
  })

  it('setSession stores the user and resolves permissions from roles', () => {
    authStore.getState().setSession(user)
    const s = authStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user).toEqual(user)
    expect(s.permissions.has(PERMISSIONS.DEVICE_WRITE)).toBe(true)
    expect(s.permissions.has(PERMISSIONS.USER_MANAGE)).toBe(false)
  })

  it('setUnauthenticated clears the user and permissions', () => {
    authStore.getState().setSession(user)
    authStore.getState().setUnauthenticated()
    const s = authStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(s.permissions.size).toBe(0)
  })

  it('setBootstrapError records the error state without a user', () => {
    authStore.getState().setBootstrapError()
    const s = authStore.getState()
    expect(s.status).toBe('bootstrapError')
    expect(s.user).toBeNull()
  })

  it('notifies subscribers when the permission set changes identity', () => {
    const seen: number[] = []
    const unsub = authStore.subscribe((s) => seen.push(s.permissions.size))
    authStore.getState().setSession(user)
    unsub()
    expect(seen).toContain(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/store.test.ts`
Expected: FAIL — cannot resolve `./store`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/auth/store.ts
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { resolvePermissions } from '@/lib/rbac/resolve'
import type { Permission } from '@/lib/rbac/permissions'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrapError'

export type User = {
  id: string
  email: string
  name: string
  roles: string[]
}

export type AuthState = {
  status: AuthStatus
  user: User | null
  permissions: ReadonlySet<Permission>
  setSession: (user: User) => void
  setUnauthenticated: () => void
  setBootstrapError: () => void
}

const EMPTY: ReadonlySet<Permission> = new Set()

/**
 * Vanilla store, not a React hook: the http client and the route guards both
 * read it via getState() from outside React.
 */
export const authStore = createStore<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  permissions: EMPTY,
  setSession: (user) =>
    set({ status: 'authenticated', user, permissions: resolvePermissions(user.roles) }),
  setUnauthenticated: () => set({ status: 'unauthenticated', user: null, permissions: EMPTY }),
  setBootstrapError: () => set({ status: 'bootstrapError', user: null, permissions: EMPTY }),
}))

export function useAuthStore<T>(selector: (s: AuthState) => T): T {
  return useStore(authStore, selector)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/store.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth
git commit -m "feat: add auth store with role-derived permissions"
```

---

## Task 5: HTTP client with single-flight refresh

**Files:**
- Create: `src/test/http.ts`, `src/lib/http/client.ts`
- Test: `src/lib/http/client.test.ts`

**Interfaces:**
- Consumes: `env` (Task 2)
- Produces:
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`
  - `class HttpError extends Error { status: number; body: unknown }`
  - `setHttpHooks(h: Partial<HttpHooks>)` where `HttpHooks = { onRefreshFailed: () => void; onForbidden: () => void }`
  - Test helpers: `installFetchMock()`, `resetFetchMock()`, `mockRoute(method, path, responder)`, `callCount(method, path)`, `lastInit(method, path)`

The most bug-prone module in the base. The fetch stub is built here because the refresh-race test is impossible without request counting.

- [ ] **Step 1: Write the fetch stub helper**

Not a test itself — the instrument the tests need. Route keys are `METHOD path`, matched on pathname only so query strings do not affect matching.

```ts
// src/test/http.ts
import { vi } from 'vitest'

type Responder = (req: { method: string; path: string; init: RequestInit }) => Response

const routes = new Map<string, Responder>()
const calls: { method: string; path: string; init: RequestInit }[] = []

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`

/** Register a canned response. A plain object is sent as 200 JSON. */
export function mockRoute(
  method: string,
  path: string,
  responder: Responder | Response | { status?: number; body?: unknown; headers?: HeadersInit },
): void {
  if (typeof responder === 'function') {
    routes.set(key(method, path), responder)
    return
  }
  if (responder instanceof Response) {
    routes.set(key(method, path), () => responder.clone())
    return
  }
  const { status = 200, body, headers } = responder
  routes.set(key(method, path), () =>
    body === undefined
      ? new Response(null, { status, headers })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        }),
  )
}

/** Make the next call to this route throw, simulating a network failure. */
export function mockNetworkError(method: string, path: string): void {
  routes.set(key(method, path), () => {
    throw new TypeError('Failed to fetch')
  })
}

export function callCount(method: string, path: string): number {
  return calls.filter((c) => c.method === method.toUpperCase() && c.path === path).length
}

export function lastInit(method: string, path: string): RequestInit | undefined {
  return calls.filter((c) => c.method === method.toUpperCase() && c.path === path).at(-1)?.init
}

export function installFetchMock(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = typeof input === 'string' ? input : input.toString()
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw.split('?')[0]
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ method, path, init })
    const responder = routes.get(key(method, path))
    if (!responder) throw new Error(`No mock route for ${method} ${path}`)
    return responder({ method, path, init })
  }) as unknown as typeof fetch
}

export function resetFetchMock(): void {
  routes.clear()
  calls.length = 0
  vi.restoreAllMocks()
}
```

- [ ] **Step 2: Write the failing client test**

The first test is the one that matters most: concurrent 401s must collapse into a single refresh.

```ts
// src/lib/http/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callCount,
  installFetchMock,
  lastInit,
  mockNetworkError,
  mockRoute,
  resetFetchMock,
} from '@/test/http'
import { HttpError, apiFetch, setHttpHooks } from './client'

beforeEach(() => installFetchMock())
afterEach(() => resetFetchMock())

describe('apiFetch happy path', () => {
  it('returns parsed JSON', async () => {
    mockRoute('GET', '/api/devices', { body: [{ id: 'd1' }] })
    await expect(apiFetch('/devices')).resolves.toEqual([{ id: 'd1' }])
  })

  it('always sends credentials and never an Authorization header', async () => {
    mockRoute('GET', '/api/devices', { body: [] })
    await apiFetch('/devices')
    const init = lastInit('GET', '/api/devices')
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
  })

  it('returns undefined for 204', async () => {
    mockRoute('POST', '/api/devices/d1/reboot', { status: 204 })
    await expect(apiFetch('/devices/d1/reboot', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws HttpError carrying status and body on 500', async () => {
    mockRoute('GET', '/api/devices', { status: 500, body: { message: 'boom' } })
    await expect(apiFetch('/devices')).rejects.toMatchObject({
      status: 500,
      body: { message: 'boom' },
    })
    await expect(apiFetch('/devices')).rejects.toBeInstanceOf(HttpError)
  })
})

describe('apiFetch refresh behaviour', () => {
  it('fires exactly one refresh for two concurrent 401s', async () => {
    let devicesCalls = 0
    mockRoute('GET', '/api/devices', () => {
      devicesCalls += 1
      // First call from each of the two concurrent requests gets a 401.
      return devicesCalls <= 2
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    const [a, b] = await Promise.all([apiFetch('/devices'), apiFetch('/devices')])

    expect(callCount('POST', '/api/auth/refresh')).toBe(1)
    expect(a).toEqual([])
    expect(b).toEqual([])
  })

  it('replays the original request exactly once', async () => {
    let n = 0
    mockRoute('GET', '/api/me/settings', () => {
      n += 1
      return n === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    await expect(apiFetch('/me/settings')).resolves.toEqual({ ok: true })
    expect(callCount('GET', '/api/me/settings')).toBe(2)
  })

  it('does not retry a second time when the replay also 401s', async () => {
    mockRoute('GET', '/api/devices', { status: 401 })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    await expect(apiFetch('/devices')).rejects.toMatchObject({ status: 401 })
    expect(callCount('GET', '/api/devices')).toBe(2)
    expect(callCount('POST', '/api/auth/refresh')).toBe(1)
  })

  it('does not intercept a 401 on an /auth/ path', async () => {
    mockRoute('POST', '/api/auth/login', { status: 401 })

    await expect(
      apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({}) }),
    ).rejects.toMatchObject({ status: 401 })
    expect(callCount('POST', '/api/auth/refresh')).toBe(0)
  })

  it('calls onRefreshFailed and rejects when the refresh fails', async () => {
    const onRefreshFailed = vi.fn()
    setHttpHooks({ onRefreshFailed })
    mockRoute('GET', '/api/devices', { status: 401 })
    mockRoute('POST', '/api/auth/refresh', { status: 401 })

    await expect(apiFetch('/devices')).rejects.toMatchObject({ status: 401 })
    expect(onRefreshFailed).toHaveBeenCalledTimes(1)
    expect(callCount('GET', '/api/devices')).toBe(1)
    setHttpHooks({ onRefreshFailed: () => {} })
  })

  it('allows a fresh refresh after an earlier one settled', async () => {
    let n = 0
    mockRoute('GET', '/api/devices', () => {
      n += 1
      return n % 2 === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    await apiFetch('/devices')
    await apiFetch('/devices')
    expect(callCount('POST', '/api/auth/refresh')).toBe(2)
  })
})

describe('apiFetch 403 handling', () => {
  it('calls onForbidden so permissions can be resynced', async () => {
    const onForbidden = vi.fn()
    setHttpHooks({ onForbidden })
    mockRoute('DELETE', '/api/devices/d1', { status: 403 })

    await expect(apiFetch('/devices/d1', { method: 'DELETE' })).rejects.toMatchObject({
      status: 403,
    })
    expect(onForbidden).toHaveBeenCalledTimes(1)
    setHttpHooks({ onForbidden: () => {} })
  })
})

describe('apiFetch network errors', () => {
  it('propagates a network failure as-is', async () => {
    mockNetworkError('GET', '/api/devices')
    await expect(apiFetch('/devices')).rejects.toThrow(/Failed to fetch/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/http/client.test.ts`
Expected: FAIL — cannot resolve `./client`

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/http/client.ts
import { env } from '@/config/env'
import { csrfHeaders } from './csrf'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
  }
}

export type HttpHooks = {
  /** Refresh failed: clear the session, clear the Query cache, go to login. */
  onRefreshFailed: () => void
  /** A 403 came back: resync permissions from /auth/me. */
  onForbidden: () => void
}

let hooks: HttpHooks = { onRefreshFailed: () => {}, onForbidden: () => {} }

export function setHttpHooks(next: Partial<HttpHooks>): void {
  hooks = { ...hooks, ...next }
}

const url = (path: string) => `${env.API_URL}${path}`
const isAuthPath = (path: string) => path.startsWith('/auth/')

/**
 * Module-level single-flight. N concurrent 401s join one refresh rather than
 * stampeding the endpoint; the slot is released as soon as it settles so a
 * later 401 can refresh again.
 */
let refreshInFlight: Promise<boolean> | null = null

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(url('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

function send(path: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  return fetch(url(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...csrfHeaders(method),
      ...init.headers,
    },
  })
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function toResult<T>(res: Response): Promise<T> {
  if (res.status === 403) hooks.onForbidden()
  if (!res.ok) throw new HttpError(res.status, await readBody(res))
  if (res.status === 204) return undefined as T
  return (await readBody(res)) as T
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init)

  if (res.status !== 401 || isAuthPath(path)) return toResult<T>(res)

  const refreshed = await refreshOnce()
  if (!refreshed) {
    hooks.onRefreshFailed()
    throw new HttpError(401, await readBody(res))
  }

  // Replayed exactly once. There is no loop here by construction: the retry
  // result goes straight to toResult, so a second 401 surfaces as an error.
  const retried = await send(path, init)
  return toResult<T>(retried)
}
```

- [ ] **Step 5: Create the CSRF module stub so the client compiles**

Task 6 tests it properly; this is the minimum the import needs.

```ts
// src/lib/http/csrf.ts
export function csrfHeaders(_method: string): Record<string, string> {
  return {}
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/http/client.test.ts`
Expected: PASS (12 tests)

If the concurrent-refresh test reports 2 refreshes, the single-flight slot is being cleared too early — confirm `.finally()` is attached to the promise that is *stored*, not to a copy.

- [ ] **Step 7: Commit**

```bash
git add src/test/http.ts src/lib/http
git commit -m "feat: add HTTP client with single-flight token refresh"
```

---

## Task 6: CSRF interceptor (opt-in)

**Files:**
- Modify: `src/lib/http/csrf.ts`
- Test: `src/lib/http/csrf.test.ts`

**Interfaces:**
- Consumes: `env.ENABLE_CSRF` (Task 2)
- Produces: `csrfHeaders(method: string, enabled?: boolean): Record<string, string>`, `readXsrfToken(cookie?: string): string | null`

Off by default under same-site cookies. The `enabled` parameter defaults to `env.ENABLE_CSRF`, which is what makes this testable without mocking the env module.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/http/csrf.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { csrfHeaders, readXsrfToken } from './csrf'

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'
})

describe('readXsrfToken', () => {
  it('extracts the token from a cookie string', () => {
    expect(readXsrfToken('foo=1; XSRF-TOKEN=abc123; bar=2')).toBe('abc123')
  })

  it('URL-decodes the value', () => {
    expect(readXsrfToken('XSRF-TOKEN=a%2Bb%3D')).toBe('a+b=')
  })

  it('returns null when absent', () => {
    expect(readXsrfToken('foo=1')).toBeNull()
  })

  it('does not match a cookie whose name merely ends with the same text', () => {
    expect(readXsrfToken('NOT-XSRF-TOKEN=nope')).toBeNull()
  })
})

describe('csrfHeaders', () => {
  it('returns nothing when disabled, even for a mutation', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('POST', false)).toEqual({})
  })

  it('returns nothing for a safe method when enabled', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('GET', true)).toEqual({})
    expect(csrfHeaders('HEAD', true)).toEqual({})
  })

  it('sets the header for mutating methods when enabled', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('POST', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
    expect(csrfHeaders('PATCH', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
    expect(csrfHeaders('DELETE', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
  })

  it('returns nothing when enabled but the cookie is missing', () => {
    expect(csrfHeaders('POST', true)).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/http/csrf.test.ts`
Expected: FAIL — `readXsrfToken` is not exported

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/http/csrf.ts
import { env } from '@/config/env'

const COOKIE_NAME = 'XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Double-submit CSRF. Only needed cross-domain, where SameSite=None means the
 * browser attaches cookies to requests originating from other sites.
 */
export function readXsrfToken(cookie: string = document.cookie): string | null {
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function csrfHeaders(
  method: string,
  enabled: boolean = env.ENABLE_CSRF,
): Record<string, string> {
  if (!enabled) return {}
  if (SAFE_METHODS.has(method.toUpperCase())) return {}
  const token = readXsrfToken()
  return token ? { 'X-XSRF-TOKEN': token } : {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/http`
Expected: PASS (21 tests — 12 from Task 5, 9 here)

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/csrf.ts src/lib/http/csrf.test.ts
git commit -m "feat: add opt-in double-submit CSRF interceptor"
```

---

## Task 7: Auth service — bootstrap, login, logout

**Files:**
- Create: `src/lib/auth/service.ts`
- Test: `src/lib/auth/service.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `HttpError` (Task 5); `authStore`, `type User` (Task 4)
- Produces:
  - `bootstrap(): Promise<void>` — sets exactly one of the three terminal statuses
  - `login(credentials: { email: string; password: string }): Promise<void>`
  - `logout(): Promise<void>`
  - `registerLogoutHandler(fn: () => void | Promise<void>): void`

`registerLogoutHandler` inverts a dependency that would otherwise point the wrong way: logout must clear the Query cache and close the MQTT connection, but `lib/auth` must not import `lib/mqtt` or the app's query client. The app wires those in at bootstrap.

- [ ] **Step 1: Write the failing test**

The three-outcome bootstrap is the point of this task — spec §7.1.

```ts
// src/lib/auth/service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFetchMock, mockNetworkError, mockRoute, resetFetchMock } from '@/test/http'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { authStore } from './store'
import { bootstrap, login, logout, registerLogoutHandler } from './service'

const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }

beforeEach(() => {
  installFetchMock()
  authStore.setState({ status: 'loading', user: null, permissions: new Set() })
})
afterEach(() => resetFetchMock())

describe('bootstrap', () => {
  it('authenticates on 200 and resolves permissions', async () => {
    mockRoute('GET', '/api/auth/me', { body: { user } })
    await bootstrap()
    const s = authStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user).toEqual(user)
    expect(s.permissions.has(PERMISSIONS.USER_MANAGE)).toBe(true)
  })

  it('marks unauthenticated on 401', async () => {
    mockRoute('GET', '/api/auth/me', { status: 401 })
    await bootstrap()
    expect(authStore.getState().status).toBe('unauthenticated')
  })

  it('marks bootstrapError on a network failure, NOT unauthenticated', async () => {
    mockNetworkError('GET', '/api/auth/me')
    await bootstrap()
    expect(authStore.getState().status).toBe('bootstrapError')
  })

  it('marks bootstrapError on a 500', async () => {
    mockRoute('GET', '/api/auth/me', { status: 500 })
    await bootstrap()
    expect(authStore.getState().status).toBe('bootstrapError')
  })

  it('never throws, so the app can always render', async () => {
    mockNetworkError('GET', '/api/auth/me')
    await expect(bootstrap()).resolves.toBeUndefined()
  })
})

describe('login', () => {
  it('sets the session from the login response body', async () => {
    mockRoute('POST', '/api/auth/login', { body: { user } })
    await login({ email: 'a@b.co', password: 'pw' })
    expect(authStore.getState().status).toBe('authenticated')
    expect(authStore.getState().user).toEqual(user)
  })

  it('falls back to /auth/me when login returns no body', async () => {
    mockRoute('POST', '/api/auth/login', { status: 204 })
    mockRoute('GET', '/api/auth/me', { body: { user } })
    await login({ email: 'a@b.co', password: 'pw' })
    expect(authStore.getState().user).toEqual(user)
  })

  it('propagates a 401 and leaves the store unauthenticated', async () => {
    mockRoute('POST', '/api/auth/login', { status: 401, body: { message: 'nope' } })
    await expect(login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    })
    expect(authStore.getState().status).not.toBe('authenticated')
  })
})

describe('logout', () => {
  it('clears the session and runs registered handlers', async () => {
    const handler = vi.fn()
    registerLogoutHandler(handler)
    authStore.getState().setSession(user)
    mockRoute('POST', '/api/auth/logout', { status: 204 })

    await logout()

    expect(authStore.getState().status).toBe('unauthenticated')
    expect(authStore.getState().user).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('still clears local state when the server call fails', async () => {
    authStore.getState().setSession(user)
    mockNetworkError('POST', '/api/auth/logout')
    await logout()
    expect(authStore.getState().status).toBe('unauthenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/service.test.ts`
Expected: FAIL — cannot resolve `./service`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/auth/service.ts
import { HttpError, apiFetch } from '@/lib/http/client'
import { authStore, type User } from './store'

type MeResponse = { user: User }

const logoutHandlers: Array<() => void | Promise<void>> = []

/**
 * Lets the app attach teardown (clear the Query cache, close MQTT) without
 * lib/auth having to import lib/mqtt or the query client.
 */
export function registerLogoutHandler(fn: () => void | Promise<void>): void {
  logoutHandlers.push(fn)
}

/**
 * Resolves the session before the router mounts. Has three outcomes, and the
 * third matters: a BE outage must not be reported as "logged out", or every
 * user gets bounced to a login page that cannot work either.
 */
export async function bootstrap(): Promise<void> {
  try {
    const { user } = await apiFetch<MeResponse>('/auth/me')
    authStore.getState().setSession(user)
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      authStore.getState().setUnauthenticated()
      return
    }
    authStore.getState().setBootstrapError()
  }
}

export async function login(credentials: { email: string; password: string }): Promise<void> {
  const res = await apiFetch<MeResponse | undefined>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
  if (res?.user) {
    authStore.getState().setSession(res.user)
    return
  }
  const { user } = await apiFetch<MeResponse>('/auth/me')
  authStore.getState().setSession(user)
}

/** Clears local state even if the server call fails — the user asked to leave. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // ignored on purpose
  }
  authStore.getState().setUnauthenticated()
  for (const fn of logoutHandlers) await fn()
}

/** Resyncs permissions after a 403; wired to the http client's onForbidden hook. */
export async function resyncSession(): Promise<void> {
  try {
    const { user } = await apiFetch<MeResponse>('/auth/me')
    authStore.getState().setSession(user)
  } catch {
    // A failure here is already handled by the 401 path.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth`
Expected: PASS (15 tests — 5 from Task 4, 10 here)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/service.ts src/lib/auth/service.test.ts
git commit -m "feat: add auth service with three-outcome bootstrap"
```

---

## Task 8: RBAC React surfaces — usePermissions and Can

**Files:**
- Create: `src/lib/rbac/usePermissions.ts`, `src/lib/rbac/Can.tsx`, `src/test/render.tsx`
- Test: `src/lib/rbac/Can.test.tsx`, `src/lib/rbac/usePermissions.test.tsx`

**Interfaces:**
- Consumes: `can`/`canAll`/`canAny` (Task 3), `useAuthStore` (Task 4)
- Produces:
  - `usePermissions(): { can: (p: Permission) => boolean; canAll: (ps: Permission[]) => boolean; canAny: (ps: Permission[]) => boolean }`
  - `<Can permission={...} | anyOf={...} | allOf={...} fallback={...}>`
  - `renderWithProviders(ui)` test helper

- [ ] **Step 1: Write the test render helper**

Kept deliberately thin here — Task 11 extends it once a router exists.

```tsx
// src/test/render.tsx
import type { ReactElement, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  const queryClient = makeTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/lib/rbac/Can.test.tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { authStore } from '@/lib/auth/store'
import { PERMISSIONS } from './permissions'
import { Can } from './Can'

const asRole = (roles: string[]) =>
  authStore.getState().setSession({ id: 'u1', email: 'a@b.co', name: 'Ann', roles })

beforeEach(() => authStore.getState().setUnauthenticated())

describe('<Can>', () => {
  it('renders children when the permission is held', () => {
    asRole(['operator'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_WRITE}>
        <button>Edit</button>
      </Can>,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('renders nothing when the permission is missing', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_WRITE}>
        <button>Edit</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('renders the fallback when denied', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_DELETE} fallback={<span>no access</span>}>
        <button>Delete</button>
      </Can>,
    )
    expect(screen.getByText('no access')).toBeInTheDocument()
  })

  it('supports anyOf', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can anyOf={[PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW]}>
        <span>visible</span>
      </Can>,
    )
    expect(screen.getByText('visible')).toBeInTheDocument()
  })

  it('supports allOf', () => {
    asRole(['operator'])
    renderWithProviders(
      <Can allOf={[PERMISSIONS.DEVICE_VIEW, PERMISSIONS.USER_MANAGE]}>
        <span>visible</span>
      </Can>,
    )
    expect(screen.queryByText('visible')).not.toBeInTheDocument()
  })

  it('re-renders when roles change mid-session', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_WRITE}>
        <button>Edit</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    asRole(['operator'])
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
```

```tsx
// src/lib/rbac/usePermissions.test.tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { authStore } from '@/lib/auth/store'
import { PERMISSIONS } from './permissions'
import { usePermissions } from './usePermissions'

function Probe() {
  const { can, canAll, canAny } = usePermissions()
  return (
    <ul>
      <li>can:{String(can(PERMISSIONS.DEVICE_VIEW))}</li>
      <li>all:{String(canAll([PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE]))}</li>
      <li>any:{String(canAny([PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW]))}</li>
    </ul>
  )
}

beforeEach(() => authStore.getState().setUnauthenticated())

describe('usePermissions', () => {
  it('reflects the current session', () => {
    authStore
      .getState()
      .setSession({ id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['viewer'] })
    renderWithProviders(<Probe />)
    expect(screen.getByText('can:true')).toBeInTheDocument()
    expect(screen.getByText('all:false')).toBeInTheDocument()
    expect(screen.getByText('any:true')).toBeInTheDocument()
  })

  it('denies everything with no session', () => {
    renderWithProviders(<Probe />)
    expect(screen.getByText('can:false')).toBeInTheDocument()
    expect(screen.getByText('any:false')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/rbac/Can.test.tsx src/lib/rbac/usePermissions.test.tsx`
Expected: FAIL — cannot resolve `./Can` and `./usePermissions`

- [ ] **Step 4: Write the implementations**

```ts
// src/lib/rbac/usePermissions.ts
import { useMemo } from 'react'
import { useAuthStore } from '@/lib/auth/store'
import { can as canFn, canAll as canAllFn, canAny as canAnyFn } from './can'
import type { Permission } from './permissions'

export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions)
  return useMemo(
    () => ({
      can: (p: Permission) => canFn(permissions, p),
      canAll: (ps: readonly Permission[]) => canAllFn(permissions, ps),
      canAny: (ps: readonly Permission[]) => canAnyFn(permissions, ps),
    }),
    [permissions],
  )
}
```

```tsx
// src/lib/rbac/Can.tsx
import type { ReactNode } from 'react'
import { usePermissions } from './usePermissions'
import type { Permission } from './permissions'

type Props = {
  children: ReactNode
  fallback?: ReactNode
  permission?: Permission
  anyOf?: readonly Permission[]
  allOf?: readonly Permission[]
}

/**
 * Element-level gating. This hides controls; it does not protect anything.
 * The BE endpoint is the authorization boundary.
 */
export function Can({ children, fallback = null, permission, anyOf, allOf }: Props) {
  const { can, canAll, canAny } = usePermissions()

  const allowed =
    (permission === undefined || can(permission)) &&
    (anyOf === undefined || canAny(anyOf)) &&
    (allOf === undefined || canAll(allOf))

  return <>{allowed ? children : fallback}</>
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/rbac`
Expected: PASS (21 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/rbac/usePermissions.ts src/lib/rbac/Can.tsx src/lib/rbac/*.test.tsx src/test/render.tsx
git commit -m "feat: add usePermissions hook and Can gating component"
```

---

## Task 9: Route guards

**Files:**
- Create: `src/lib/rbac/guards.ts`
- Test: `src/lib/rbac/guards.test.ts`

**Interfaces:**
- Consumes: `canAll`/`canAny` (Task 3), `type AuthState` (Task 4), `redirect` from `@tanstack/react-router`
- Produces:
  - `type RouterAuthSnapshot = Pick<AuthState, 'status' | 'permissions'>`
  - `type GuardArgs = { context: { getAuth: () => RouterAuthSnapshot }; location: { href: string } }`
  - `requireAuth(args: GuardArgs): void`
  - `requirePermission(...need: Permission[]): (args: GuardArgs) => void`
  - `requireAnyPermission(...need: Permission[]): (args: GuardArgs) => void`

Guards take auth through `context.getAuth()` rather than importing the store, which is exactly what makes them plain functions a test can call with a fake.

- [ ] **Step 1: Write the failing test**

The `redirectTarget` helper reads the thrown redirect from either shape TanStack has used, so the test asserts on behaviour rather than on a library internal.

```ts
// src/lib/rbac/guards.test.ts
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, type Permission } from './permissions'
import { requireAnyPermission, requireAuth, requirePermission } from './guards'
import type { GuardArgs } from './guards'

function redirectTarget(thrown: unknown): string | undefined {
  const obj = thrown as { to?: unknown; options?: { to?: unknown } }
  const to = obj?.to ?? obj?.options?.to
  return typeof to === 'string' ? to : undefined
}

function catchThrown(fn: () => void): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

const args = (
  status: 'authenticated' | 'unauthenticated' | 'loading' | 'bootstrapError',
  perms: Permission[] = [],
  href = '/devices/42',
): GuardArgs => ({
  context: { getAuth: () => ({ status, permissions: new Set(perms) }) },
  location: { href },
})

describe('requireAuth', () => {
  it('passes when authenticated', () => {
    expect(() => requireAuth(args('authenticated'))).not.toThrow()
  })

  it('redirects to /login when unauthenticated', () => {
    const thrown = catchThrown(() => requireAuth(args('unauthenticated')))
    expect(thrown).toBeDefined()
    expect(redirectTarget(thrown)).toBe('/login')
  })

  it('carries the attempted path so login can bounce back', () => {
    const thrown = catchThrown(() => requireAuth(args('unauthenticated', [], '/devices/42')))
    expect(JSON.stringify(thrown)).toContain('/devices/42')
  })

  it('redirects when the status is still loading', () => {
    expect(() => requireAuth(args('loading'))).toThrow()
  })
})

describe('requirePermission', () => {
  it('passes when every required permission is held', () => {
    const guard = requirePermission(PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE)
    expect(() =>
      guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE])),
    ).not.toThrow()
  })

  it('redirects to /forbidden when one is missing', () => {
    const guard = requirePermission(PERMISSIONS.DEVICE_VIEW, PERMISSIONS.USER_MANAGE)
    const thrown = catchThrown(() => guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW])))
    expect(redirectTarget(thrown)).toBe('/forbidden')
  })

  it('redirects to /forbidden when no permissions are held', () => {
    const guard = requirePermission(PERMISSIONS.DEVICE_VIEW)
    expect(() => guard(args('authenticated', []))).toThrow()
  })
})

describe('requireAnyPermission', () => {
  it('passes when one of several is held', () => {
    const guard = requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW)
    expect(() => guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW]))).not.toThrow()
  })

  it('redirects to /forbidden when none are held', () => {
    const guard = requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_DELETE)
    const thrown = catchThrown(() => guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW])))
    expect(redirectTarget(thrown)).toBe('/forbidden')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rbac/guards.test.ts`
Expected: FAIL — cannot resolve `./guards`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/rbac/guards.ts
import { redirect } from '@tanstack/react-router'
import type { AuthState } from '@/lib/auth/store'
import { canAll, canAny } from './can'
import type { Permission } from './permissions'

export type RouterAuthSnapshot = Pick<AuthState, 'status' | 'permissions'>

export type GuardArgs = {
  context: { getAuth: () => RouterAuthSnapshot }
  location: { href: string }
}

/**
 * Blocks a route for anyone without a session. Not a security boundary — it
 * keeps users out of pages that would only fail against the API anyway.
 */
export function requireAuth({ context, location }: GuardArgs): void {
  if (context.getAuth().status !== 'authenticated') {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
}

export function requirePermission(...need: Permission[]) {
  return ({ context }: GuardArgs): void => {
    if (!canAll(context.getAuth().permissions, need)) {
      throw redirect({ to: '/forbidden' })
    }
  }
}

export function requireAnyPermission(...need: Permission[]) {
  return ({ context }: GuardArgs): void => {
    if (!canAny(context.getAuth().permissions, need)) {
      throw redirect({ to: '/forbidden' })
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rbac/guards.test.ts`
Expected: PASS (9 tests)

If `redirect({ to: '/login', search: {...} })` fails typecheck because the route tree does not exist yet, leave it and re-run `npm run typecheck` after Task 11 — TanStack types route paths against the generated tree.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rbac/guards.ts src/lib/rbac/guards.test.ts
git commit -m "feat: add composable route guards for auth and permissions"
```

---

## Task 10: Tailwind UI primitives

**Files:**
- Create: `src/modules/global/components/Button.tsx`, `Input.tsx`, `Spinner.tsx`, `Badge.tsx`, `Table.tsx`, `Alert.tsx`
- Test: `src/modules/global/components/Button.test.tsx`, `src/modules/global/components/Input.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `<Button variant="primary"|"secondary"|"danger" loading?>` — extends `ButtonHTMLAttributes`
  - `<Input label error?>` — extends `InputHTMLAttributes`, forwards ref, auto-associates label and error via `aria-describedby`
  - `<Spinner />`, `<Badge tone="ok"|"warn"|"error"|"neutral">`, `<Table>`/`<Th>`/`<Td>`, `<Alert tone="error"|"info">`

Only `Button` and `Input` carry behaviour worth testing; the rest are styling shells. `Input` is tested because label association and `aria-describedby` are exactly the things that silently rot.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/modules/global/components/Button.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('<Button>', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled and does not fire while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('exposes busy state to assistive tech while loading', () => {
    render(<Button loading>Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('honours an explicit disabled prop', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

```tsx
// src/modules/global/components/Input.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './Input'

describe('<Input>', () => {
  it('associates the label with the control', () => {
    render(<Input label="Email" name="email" />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('renders an error and links it via aria-describedby', () => {
    render(<Input label="Email" name="email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Required')
  })

  it('is not marked invalid without an error', () => {
    render(<Input label="Email" name="email" />)
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/global/components`
Expected: FAIL — cannot resolve `./Button` and `./Input`

- [ ] **Step 3: Write Button and Input**

```tsx
// src/modules/global/components/Button.tsx
import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400',
  secondary:
    'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
```

```tsx
// src/modules/global/components/Input.tsx
import { forwardRef, useId, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, id, className = '', ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded border px-3 py-2 text-sm ${
          error ? 'border-red-500' : 'border-slate-300'
        } ${className}`}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
})
```

- [ ] **Step 4: Write the remaining presentational primitives**

```tsx
// src/modules/global/components/Spinner.tsx
export function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}
```

```tsx
// src/modules/global/components/Badge.tsx
type Tone = 'ok' | 'warn' | 'error' | 'neutral'

const TONES: Record<Tone, string> = {
  ok: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  neutral: 'bg-slate-100 text-slate-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
  )
}
```

```tsx
// src/modules/global/components/Table.tsx
import type { ReactNode } from 'react'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-600">
      {children}
    </th>
  )
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2">{children}</td>
}
```

```tsx
// src/modules/global/components/Alert.tsx
import type { ReactNode } from 'react'

const TONES = {
  error: 'border-red-300 bg-red-50 text-red-800',
  info: 'border-slate-300 bg-slate-50 text-slate-700',
} as const

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
}) {
  return (
    <div role="alert" className={`rounded border px-3 py-2 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/global/components`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/modules/global/components
git commit -m "feat: add Tailwind UI primitives"
```

---

## Task 11: Router, route tree, error tiers and app bootstrap

**Files:**
- Create: `src/app/queryClient.ts`, `src/app/router.tsx`, `src/app/AppErrorBoundary.tsx`, `src/app/AppRoot.tsx`, `src/lib/auth/safeRedirect.ts`, `src/routes/__root.tsx`, `src/routes/_public.tsx`, `src/routes/_public.login.tsx`, `src/routes/_auth.tsx`, `src/routes/_auth.index.tsx`, `src/routes/_auth.forbidden.tsx`, `src/test/router.tsx`
- Modify: `src/main.tsx`
- Test: `src/lib/auth/safeRedirect.test.ts`, `src/app/routing.test.tsx`

**Interfaces:**
- Consumes: `requireAuth` (Task 9), `authStore`/`bootstrap`/`logout`/`resyncSession` (Tasks 4, 7), `setHttpHooks`/`registerLogoutHandler` (Tasks 5, 7), UI primitives (Task 10)
- Produces:
  - `type RouterContext = { getAuth: () => RouterAuthSnapshot; queryClient: QueryClient }`
  - `queryClient` singleton
  - `router` singleton, registered with the `Register` interface so `Link`/`redirect` are type-safe
  - `safeRedirect(raw: unknown): string` — same-origin relative path or `'/'`
  - `renderRoute(path, opts?)` test helper
  - `src/routeTree.gen.ts` now exists

The wiring task. Everything built so far becomes an application here.

- [ ] **Step 1: Write the failing safeRedirect test**

Guarding `?redirect=` first, because the login route's `validateSearch` depends on it and an unvalidated value is an open redirect.

```ts
// src/lib/auth/safeRedirect.test.ts
import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  it('passes through a relative path', () => {
    expect(safeRedirect('/devices/42')).toBe('/devices/42')
  })

  it('keeps a query string and hash', () => {
    expect(safeRedirect('/devices?tab=live#top')).toBe('/devices?tab=live#top')
  })

  it('rejects an absolute URL', () => {
    expect(safeRedirect('https://evil.example.com/phish')).toBe('/')
  })

  it('rejects a protocol-relative URL', () => {
    expect(safeRedirect('//evil.example.com')).toBe('/')
  })

  it('rejects a backslash-obfuscated URL', () => {
    expect(safeRedirect('/\\evil.example.com')).toBe('/')
  })

  it('rejects a javascript: scheme', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })

  it('rejects a non-string', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(42)).toBe('/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/safeRedirect.test.ts`
Expected: FAIL — cannot resolve `./safeRedirect`

- [ ] **Step 3: Write safeRedirect**

```ts
// src/lib/auth/safeRedirect.ts
/**
 * Constrains a ?redirect= value to a same-origin relative path. Anything else
 * becomes '/', so the parameter cannot be used to bounce a user off-site after
 * login.
 */
export function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return '/'
  // Must start with a single slash, and not '//' or '/\' which browsers treat
  // as protocol-relative.
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/safeRedirect.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the query client and root route**

```ts
// src/app/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

```tsx
// src/routes/__root.tsx
import { Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { RouterAuthSnapshot } from '@/lib/rbac/guards'
import { Button } from '@/modules/global/components/Button'

export type RouterContext = {
  getAuth: () => RouterAuthSnapshot
  queryClient: QueryClient
}

/** Tier 2: a bare page for anything escaping above the authenticated shell. */
function RootError({ error }: { error: Error }) {
  const router = useRouter()
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">{error.message}</p>
      <div className="mt-4">
        <Button onClick={() => router.invalidate()}>Try again</Button>
      </div>
    </main>
  )
}

/** Bad URL — no route matched at all. */
function RootNotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">That address does not exist.</p>
      <a className="mt-4 inline-block text-sm underline" href="/">
        Go home
      </a>
    </main>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
})
```

- [ ] **Step 6: Write the public and authenticated layout routes**

```tsx
// src/routes/_public.tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  beforeLoad: ({ context }) => {
    if (context.getAuth().status === 'authenticated') throw redirect({ to: '/' })
  },
  component: () => (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <Outlet />
    </div>
  ),
})
```

```tsx
// src/routes/_auth.tsx
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router'
import { requireAuth } from '@/lib/rbac/guards'
import { Button } from '@/modules/global/components/Button'

/** Tier 1: keeps the shell so the user can navigate away from a failure. */
function ShellError({ error }: { error: Error }) {
  const router = useRouter()
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">This page failed to load</h2>
      <p className="mt-2 text-sm text-slate-600">{error.message}</p>
      <div className="mt-4">
        <Button onClick={() => router.invalidate()}>Retry</Button>
      </div>
    </div>
  )
}

/** Resource not found, inside the shell — the loader threw notFound(). */
function ShellNotFound() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-slate-600">
        That item does not exist, or it has been removed.
      </p>
    </div>
  )
}

export const Route = createFileRoute('/_auth')({
  beforeLoad: requireAuth,
  component: () => <Outlet />,
  errorComponent: ShellError,
  notFoundComponent: ShellNotFound,
})
```

The `component` is a bare `<Outlet />` for now; Task 12 replaces it with the nav shell.

- [ ] **Step 7: Write the leaf routes**

```tsx
// src/routes/_auth.index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/')({
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
    </div>
  ),
})
```

```tsx
// src/routes/_auth.forbidden.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/forbidden')({
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Not permitted</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your account does not have access to this page.
      </p>
    </div>
  ),
})
```

`_public.login.tsx` — the placeholder that owns search-param validation. Task 13 fills in the form.

```tsx
// src/routes/_public.login.tsx
import { createFileRoute } from '@tanstack/react-router'
import { safeRedirect } from '@/lib/auth/safeRedirect'

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
    </div>
  ),
})
```

- [ ] **Step 8: Write the router, error boundary and app root**

```tsx
// src/app/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { authStore } from '@/lib/auth/store'
import { queryClient } from './queryClient'

export const router = createRouter({
  routeTree,
  context: {
    getAuth: () => authStore.getState(),
    queryClient,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

```tsx
// src/app/AppErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Tier 3: sits outside RouterProvider, so it still renders when the router or
 * a provider is what failed. Without it those failures are a white screen.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] unrecoverable error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">The application failed to start</h1>
        <p className="mt-2 text-sm text-slate-600">{this.state.error.message}</p>
        <button className="mt-4 text-sm underline" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}
```

```tsx
// src/app/AppRoot.tsx
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth/store'
import { bootstrap } from '@/lib/auth/service'
import { Button } from '@/modules/global/components/Button'
import { queryClient } from './queryClient'
import { router } from './router'

/** The third bootstrap outcome: the server could not be reached at all. */
function ServerUnreachable() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Cannot reach the server</h1>
      <p className="mt-2 text-sm text-slate-600">
        You have not been signed out — the application could not contact the server.
      </p>
      <div className="mt-4">
        <Button onClick={() => void bootstrap()}>Retry</Button>
      </div>
    </main>
  )
}

export function AppRoot() {
  const status = useAuthStore((s) => s.status)

  return (
    <QueryClientProvider client={queryClient}>
      {status === 'bootstrapError' ? <ServerUnreachable /> : <RouterProvider router={router} />}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 9: Rewrite `src/main.tsx` to wire everything together**

This is where the cross-module hooks are connected — the one place that knows about auth, http, and the router at once.

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client'
import { setHttpHooks } from '@/lib/http/client'
import { authStore } from '@/lib/auth/store'
import { bootstrap, registerLogoutHandler, resyncSession } from '@/lib/auth/service'
import { queryClient } from '@/app/queryClient'
import { router } from '@/app/router'
import { AppErrorBoundary } from '@/app/AppErrorBoundary'
import { AppRoot } from '@/app/AppRoot'
import './index.css'

// A failed refresh is a hard logout: drop cached data so the next user cannot
// see it, then let the guards do the redirecting.
setHttpHooks({
  onRefreshFailed: () => {
    authStore.getState().setUnauthenticated()
    queryClient.clear()
  },
  onForbidden: () => {
    void resyncSession()
  },
})

registerLogoutHandler(() => queryClient.clear())

// Guards only re-run on navigation, so tell the router when auth changes
// underneath it. Logout therefore needs no explicit navigate() anywhere.
authStore.subscribe((s, prev) => {
  if (s.status !== prev.status || s.permissions !== prev.permissions) {
    void router.invalidate()
  }
})

const el = document.getElementById('root')
if (!el) throw new Error('#root not found')

// Resolve the session BEFORE mounting the router, so no guard ever runs
// against an unknown session.
void bootstrap().finally(() => {
  createRoot(el).render(
    <AppErrorBoundary>
      <AppRoot />
    </AppErrorBoundary>,
  )
})
```

- [ ] **Step 10: Generate the route tree and verify it compiles**

```bash
npx tsr generate || npm run build
npm run typecheck
```

Expected: `src/routeTree.gen.ts` now exists and typecheck passes. If `tsr` is unavailable, `npm run build` runs the Vite plugin, which generates the same file.

- [ ] **Step 11: Write the route test helper**

```tsx
// src/test/router.tsx
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { routeTree } from '@/routeTree.gen'
import { authStore } from '@/lib/auth/store'
import { makeTestQueryClient } from './render'

/** Mounts the real route tree at a path, with the real store as context. */
export function renderRoute(path: string) {
  const queryClient = makeTestQueryClient()
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { getAuth: () => authStore.getState(), queryClient },
    defaultPreload: false,
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  )
  return { router, queryClient, ...utils }
}

export const signIn = (roles: string[]) =>
  authStore.getState().setSession({ id: 'u1', email: 'a@b.co', name: 'Ann', roles })
```

The `as any` on `RouterProvider` is deliberate and confined to the test helper: the locally-constructed router has a different identity from the registered singleton, which TanStack's `Register` types reject. Production code never does this.

- [ ] **Step 12: Write the failing routing test**

```tsx
// src/app/routing.test.tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => authStore.getState().setUnauthenticated())

describe('route guards end to end', () => {
  it('sends an unauthenticated visitor from / to the login page', async () => {
    const { router } = renderRoute('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('preserves the attempted path in the redirect search param', async () => {
    const { router } = renderRoute('/devices/42')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toMatchObject({ redirect: '/devices/42' })
  })

  it('renders the dashboard for an authenticated user', async () => {
    signIn(['viewer'])
    renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('bounces an authenticated user away from /login', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/login')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('renders the bare 404 page for an unknown URL', async () => {
    signIn(['viewer'])
    renderRoute('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('renders the forbidden page inside the authenticated area', async () => {
    signIn(['viewer'])
    renderRoute('/forbidden')
    expect(await screen.findByRole('heading', { name: 'Not permitted' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 13: Run the test**

Run: `npx vitest run src/app/routing.test.tsx`
Expected: PASS (6 tests)

If the redirect assertions fail because `authStore` starts as `loading`, confirm `beforeEach` calls `setUnauthenticated()` — `requireAuth` treats `loading` as not authenticated by design, so both redirect, but only `unauthenticated` is the state under test.

- [ ] **Step 14: Run the whole suite and commit**

```bash
npm test
npm run lint
npm run typecheck
git add -A
git commit -m "feat: wire router, error tiers and session bootstrap"
```

---

## Task 12: Navigation manifest and app shell

**Files:**
- Create: `src/config/nav.ts`, `src/components/AppShell.tsx`
- Modify: `src/routes/_auth.tsx` (use `AppShell` as the layout component)
- Test: `src/config/nav.test.ts`, `src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: `PERMISSIONS` (Task 3), `usePermissions` (Task 8), `logout` (Task 7), `renderRoute`/`signIn` (Task 11)
- Produces:
  - `NAV_ITEMS: readonly { to: string; label: string; permission?: Permission }[]`
  - `visibleNavItems(can: (p: Permission) => boolean)` — pure filter
  - `<AppShell>` — sidebar + header + `<Outlet />`

One manifest so the sidebar cannot drift away from the guards. The filter is a pure function, tested without rendering.

- [ ] **Step 1: Write the failing nav test**

```ts
// src/config/nav.test.ts
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, type Permission } from '@/lib/rbac/permissions'
import { NAV_ITEMS, visibleNavItems } from './nav'

const canFrom = (held: Permission[]) => (p: Permission) => held.includes(p)

describe('visibleNavItems', () => {
  it('always shows items with no permission requirement', () => {
    const labels = visibleNavItems(canFrom([])).map((i) => i.label)
    expect(labels).toContain('Dashboard')
  })

  it('hides Devices from a user without device.view', () => {
    const labels = visibleNavItems(canFrom([])).map((i) => i.label)
    expect(labels).not.toContain('Devices')
  })

  it('shows Devices but not Admin for an operator', () => {
    const labels = visibleNavItems(
      canFrom([PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE]),
    ).map((i) => i.label)
    expect(labels).toContain('Devices')
    expect(labels).not.toContain('Users')
  })

  it('shows every item to an admin', () => {
    const all = Object.values(PERMISSIONS)
    expect(visibleNavItems(canFrom(all))).toHaveLength(NAV_ITEMS.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/nav.test.ts`
Expected: FAIL — cannot resolve `./nav`

- [ ] **Step 3: Write the nav manifest**

```ts
// src/config/nav.ts
import { PERMISSIONS, type Permission } from '@/lib/rbac/permissions'

export type NavItem = {
  to: string
  label: string
  permission?: Permission
}

/**
 * Single source for the sidebar. Filtering here is cosmetic — a user can type
 * any URL — so every entry must also be guarded by its route.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/devices', label: 'Devices', permission: PERMISSIONS.DEVICE_VIEW },
  { to: '/admin/users', label: 'Users', permission: PERMISSIONS.USER_MANAGE },
]

export function visibleNavItems(can: (p: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.permission === undefined || can(item.permission))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/nav.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing shell test**

```tsx
// src/components/AppShell.test.tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => authStore.getState().setUnauthenticated())

describe('<AppShell>', () => {
  it('shows the user name', async () => {
    signIn(['admin'])
    renderRoute('/')
    expect(await screen.findByText('Ann')).toBeInTheDocument()
  })

  it('shows Devices and Users to an admin', async () => {
    signIn(['admin'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Devices' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('hides Users from an operator', async () => {
    signIn(['operator'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Devices' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('hides Devices from a role with no device permission', async () => {
    signIn(['unknown-role'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Devices' })).not.toBeInTheDocument()
  })

  it('offers a sign-out control', async () => {
    signIn(['viewer'])
    renderRoute('/')
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
```

The fourth test doubles as a live check on the unknown-role behaviour from Task 3: an unrecognised role yields a usable, permission-free UI rather than a crash.

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/components/AppShell.test.tsx`
Expected: FAIL — no `Devices` link; `_auth.tsx` still renders a bare `<Outlet />`

- [ ] **Step 7: Write AppShell**

```tsx
// src/components/AppShell.tsx
import { Link, Outlet } from '@tanstack/react-router'
import { useAuthStore } from '@/lib/auth/store'
import { logout } from '@/lib/auth/service'
import { usePermissions } from '@/lib/rbac/usePermissions'
import { visibleNavItems } from '@/config/nav'
import { Button } from '@/modules/global/components/Button'

export function AppShell() {
  const { can } = usePermissions()
  const user = useAuthStore((s) => s.user)
  const items = visibleNavItems(can)

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <nav aria-label="Main" className="border-r border-slate-200 bg-slate-50 p-4">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
                activeProps={{ className: 'block rounded px-3 py-2 text-sm bg-slate-900 text-white' }}
                activeOptions={{ exact: item.to === '/' }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <span className="text-sm font-medium text-slate-700">{user?.name}</span>
          <Button variant="secondary" onClick={() => void logout()}>
            Sign out
          </Button>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Use it as the authenticated layout**

In `src/routes/_auth.tsx`, replace the `component` line:

```tsx
// remove: component: () => <Outlet />,
component: AppShell,
```

Add `import { AppShell } from '@/components/AppShell'` and drop the now-unused `Outlet` import.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run src/components/AppShell.test.tsx src/app/routing.test.tsx`
Expected: PASS (11 tests)

`Link to="/devices"` will not typecheck until that route exists in Task 17. If `npm run typecheck` complains, `NAV_ITEMS[].to` is typed as `string`, which is intentional — the manifest is data, not a typed route reference. Confirm the error is only about `Link`'s `to` prop and, if so, keep `to={item.to as never}` narrowed at the single call site with a comment, then remove the cast after Task 17.

- [ ] **Step 10: Commit**

```bash
git add src/config/nav.ts src/config/nav.test.ts src/components/AppShell.tsx src/components/AppShell.test.tsx src/routes/_auth.tsx
git commit -m "feat: add permission-filtered navigation and app shell"
```

---

## Task 13: Login page

**Files:**
- Modify: `src/routes/_public.login.tsx`
- Create: `src/modules/auth/LoginForm.tsx`
- Test: `src/modules/auth/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `login` (Task 7), `HttpError` (Task 5), `Input`/`Button`/`Alert` (Task 10), `safeRedirect` (Task 11)
- Produces: `<LoginForm onSuccess={() => void} />`

Split from the route so the form is testable without mounting the router.

- [ ] **Step 1: Write the failing test**

```tsx
// src/modules/auth/LoginForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { LoginForm } from './LoginForm'

beforeEach(() => {
  installFetchMock()
  authStore.getState().setUnauthenticated()
})
afterEach(() => resetFetchMock())

const fill = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

describe('<LoginForm>', () => {
  it('validates the email format before submitting', async () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    await fill('not-an-email', 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  it('requires a password', async () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument()
  })

  it('calls onSuccess after a successful login', async () => {
    const onSuccess = vi.fn()
    mockRoute('POST', '/api/auth/login', {
      body: { user: { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['viewer'] } },
    })
    render(<LoginForm onSuccess={onSuccess} />)
    await fill('a@b.co', 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(authStore.getState().status).toBe('authenticated')
  })

  it('shows a form-level error on 401 that names neither field', async () => {
    mockRoute('POST', '/api/auth/login', { status: 401 })
    render(<LoginForm onSuccess={vi.fn()} />)
    await fill('a@b.co', 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/email or password is incorrect/i)
    // Must not disclose which one was wrong.
    expect(alert).not.toHaveTextContent(/no such account|unknown email|wrong password/i)
  })

  it('shows a rate-limit message on 429', async () => {
    mockRoute('POST', '/api/auth/login', { status: 429 })
    render(<LoginForm onSuccess={vi.fn()} />)
    await fill('a@b.co', 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i)
  })

  it('shows a retry message when the server cannot be reached', async () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    await fill('a@b.co', 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })

  it('disables submit while the request is pending', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((r) => (release = r))
    mockRoute('POST', '/api/auth/login', () => {
      // Responder is sync; the gate is awaited by the assertion below instead.
      return new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    mockRoute('GET', '/api/auth/me', {
      body: { user: { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['viewer'] } },
    })
    render(<LoginForm onSuccess={vi.fn()} />)
    await fill('a@b.co', 'pw')
    const btn = screen.getByRole('button', { name: /sign in/i })
    await userEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    release?.()
    await gate.catch(() => {})
  })

  it('has the autocomplete attributes password managers need', () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})
```

Note the sixth test registers no route for `/api/auth/login`, so the fetch stub throws — which is exactly the network-failure path being asserted.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/auth/LoginForm.test.tsx`
Expected: FAIL — cannot resolve `./LoginForm`

- [ ] **Step 3: Write LoginForm**

```tsx
// src/modules/auth/LoginForm.tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HttpError } from '@/lib/http/client'
import { login } from '@/lib/auth/service'
import { Button } from '@/modules/global/components/Button'
import { Input } from '@/modules/global/components/Input'
import { Alert } from '@/modules/global/components/Alert'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type Values = z.infer<typeof schema>

/** Deliberately never says which field was wrong — that confirms which accounts exist. */
function messageFor(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return 'That email or password is incorrect.'
    if (err.status === 429) return 'Too many attempts. Please wait and try again.'
    return 'Something went wrong signing you in. Please try again.'
  }
  return 'Could not reach the server. Check your connection and try again.'
}

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values)
      onSuccess()
    } catch (err) {
      setFormError(messageFor(err))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="w-80 rounded border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Sign in</h1>

      <div className="mt-4 flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/auth/LoginForm.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Mount the form in the route**

```tsx
// src/routes/_public.login.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { safeRedirect } from '@/lib/auth/safeRedirect'
import { LoginForm } from '@/modules/auth/LoginForm'

function LoginPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  return <LoginForm onSuccess={() => void navigate({ to: redirect, replace: true })} />
}

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginPage,
})
```

`replace: true` keeps the login page out of the history stack, so Back after signing in does not return to the form.

- [ ] **Step 6: Add a route-level test for the redirect bounce**

```tsx
// append to src/app/routing.test.tsx
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import userEvent from '@testing-library/user-event'

describe('login redirect bounce', () => {
  beforeEach(() => installFetchMock())
  afterEach(() => resetFetchMock())

  it('returns the user to the page they originally asked for', async () => {
    mockRoute('POST', '/api/auth/login', {
      body: { user: { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] } },
    })
    const { router } = renderRoute('/devices/42')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/devices/42'))
  })
})
```

This test needs the `/devices/$id` route, which arrives in Task 17. Until then it will land on the 404 page instead — mark it `it.skip` now and un-skip it as the final step of Task 17.

- [ ] **Step 7: Run the suite and commit**

```bash
npm test
npm run lint
git add -A
git commit -m "feat: add login page with validation and redirect bounce"
```

---

## Task 14: MQTT topics, payload schemas and credential cache

> **AMENDED 2026-09-07 by requirement change.** The user tightened the rule to
> *"the frontend never touches, stores, or even sees a token string."* The
> credential-cache half of this task (`src/lib/mqtt/credentials.ts` and its 7
> tests, Steps 5–8 below) is **deleted** — the browser authenticates to the
> broker with the session cookie it already sends on the WebSocket upgrade, so
> there is no credential for the frontend to hold. See spec §10.2. The
> superseding brief is
> `.superpowers/sdd/2026-09-07-react-base/task-14-brief-AMENDED.md`; Steps 5–8
> below are obsolete and were not executed.

**Files:**
- Create: `src/lib/mqtt/topics.ts`, `src/lib/mqtt/credentials.ts`
- Test: `src/lib/mqtt/topics.test.ts`, `src/lib/mqtt/credentials.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (Task 5)
- Produces:
  - `TOPICS` — topic builders
  - `telemetrySchema`, `statusSchema`, `deviceEventSchema` (zod) and their inferred types `Telemetry`, `DeviceStatus`, `DeviceEvent`
  - `parsePayload<T>(schema, raw): T | null` — never throws
  - `droppedCount()` / `resetDroppedCount()`
  - `matchTopic(pattern: string, topic: string): boolean` — MQTT `+` and `#` wildcards
  - `type MqttCredentials = { url; clientId; username; password; expiresAt }`
  - `ensureCredentials(now?): Promise<MqttCredentials>`, `getCachedCredentials(): MqttCredentials | null`, `clearCredentials(): void`

`matchTopic` exists because the broker handles wildcards on the wire, but the client-side dispatcher still has to route an incoming concrete topic to handlers that registered a pattern.

- [ ] **Step 1: Write the failing topics test**

```ts
// src/lib/mqtt/topics.test.ts
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import {
  TOPICS,
  droppedCount,
  matchTopic,
  parsePayload,
  resetDroppedCount,
  telemetrySchema,
} from './topics'

beforeEach(() => resetDroppedCount())
afterEach(() => vi.restoreAllMocks())

describe('TOPICS', () => {
  it('builds device topics', () => {
    expect(TOPICS.deviceTelemetry('d1')).toBe('devices/d1/telemetry')
    expect(TOPICS.deviceStatus('d1')).toBe('devices/d1/status')
    expect(TOPICS.allDeviceStatus()).toBe('devices/+/status')
  })
})

describe('matchTopic', () => {
  it('matches an exact topic', () => {
    expect(matchTopic('devices/d1/status', 'devices/d1/status')).toBe(true)
  })
  it('matches a single-level + wildcard', () => {
    expect(matchTopic('devices/+/status', 'devices/d1/status')).toBe(true)
    expect(matchTopic('devices/+/status', 'devices/d1/telemetry')).toBe(false)
  })
  it('does not let + span levels', () => {
    expect(matchTopic('devices/+', 'devices/d1/status')).toBe(false)
  })
  it('matches a multi-level # wildcard', () => {
    expect(matchTopic('devices/#', 'devices/d1/status')).toBe(true)
    expect(matchTopic('devices/#', 'devices')).toBe(true)
    expect(matchTopic('#', 'anything/at/all')).toBe(true)
  })
  it('rejects a topic shorter than the pattern', () => {
    expect(matchTopic('devices/d1/status', 'devices/d1')).toBe(false)
  })
})

describe('parsePayload', () => {
  const valid = JSON.stringify({ deviceId: 'd1', ts: 1, temp: 21.5 })

  it('parses a valid JSON string payload', () => {
    expect(parsePayload(telemetrySchema, valid)).toEqual({ deviceId: 'd1', ts: 1, temp: 21.5 })
  })

  it('parses a Uint8Array payload', () => {
    const bytes = new TextEncoder().encode(valid)
    expect(parsePayload(telemetrySchema, bytes)).toMatchObject({ deviceId: 'd1' })
  })

  it('returns null for malformed JSON without throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => parsePayload(telemetrySchema, '{not json')).not.toThrow()
    expect(parsePayload(telemetrySchema, '{not json')).toBeNull()
  })

  it('returns null when the shape is wrong', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsePayload(telemetrySchema, JSON.stringify({ deviceId: 'd1' }))).toBeNull()
  })

  it('counts dropped messages', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    parsePayload(telemetrySchema, 'garbage')
    parsePayload(telemetrySchema, '{}')
    expect(droppedCount()).toBe(2)
  })

  it('does not count a valid message as dropped', () => {
    parsePayload(telemetrySchema, valid)
    expect(droppedCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mqtt/topics.test.ts`
Expected: FAIL — cannot resolve `./topics`

- [ ] **Step 3: Write topics.ts**

```ts
// src/lib/mqtt/topics.ts
import { z } from 'zod'

export const TOPICS = {
  deviceTelemetry: (id: string) => `devices/${id}/telemetry`,
  deviceStatus: (id: string) => `devices/${id}/status`,
  allDeviceStatus: () => 'devices/+/status',
  deviceEvents: () => 'devices/events',
} as const

export const telemetrySchema = z.object({
  deviceId: z.string(),
  ts: z.number(),
  temp: z.number(),
  humidity: z.number().optional(),
})

export const statusSchema = z.object({
  deviceId: z.string(),
  online: z.boolean(),
  ts: z.number(),
})

export const deviceEventSchema = z.object({
  type: z.enum(['registered', 'deleted']),
  deviceId: z.string(),
})

export type Telemetry = z.infer<typeof telemetrySchema>
export type DeviceStatus = z.infer<typeof statusSchema>
export type DeviceEvent = z.infer<typeof deviceEventSchema>

let dropped = 0
export const droppedCount = () => dropped
export const resetDroppedCount = () => {
  dropped = 0
}

/**
 * Devices send bytes, and firmware sends malformed bytes eventually. This
 * never throws: a throw from an MQTT message handler is outside React's error
 * boundaries and can take down the connection loop.
 */
export function parsePayload<T>(schema: z.ZodType<T>, raw: Uint8Array | string): T | null {
  let text: string
  try {
    text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  } catch {
    dropped += 1
    return null
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    dropped += 1
    if (import.meta.env.DEV) console.warn('[mqtt] dropped a non-JSON payload')
    return null
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    dropped += 1
    if (import.meta.env.DEV) console.warn('[mqtt] dropped a payload failing schema validation')
    return null
  }
  return result.data
}

/** Client-side wildcard matching, for dispatching to pattern-registered handlers. */
export function matchTopic(pattern: string, topic: string): boolean {
  const p = pattern.split('/')
  const t = topic.split('/')

  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '#') return true
    if (i >= t.length) return false
    if (p[i] !== '+' && p[i] !== t[i]) return false
  }
  return p.length === t.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mqtt/topics.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Write the failing credentials test**

```ts
// src/lib/mqtt/credentials.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { callCount, installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { clearCredentials, ensureCredentials, getCachedCredentials } from './credentials'

const NOW = 1_700_000_000_000

const creds = (expiresAt: number) => ({
  url: 'ws://localhost:9001/mqtt',
  clientId: 'server-suggested',
  username: 'u',
  password: 'p',
  expiresAt,
})

beforeEach(() => {
  installFetchMock()
  clearCredentials()
})
afterEach(() => resetFetchMock())

describe('ensureCredentials', () => {
  it('fetches credentials and caches them', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { body: creds(NOW + 600_000) })
    const first = await ensureCredentials(NOW)
    expect(first.username).toBe('u')

    await ensureCredentials(NOW)
    expect(callCount('GET', '/api/iot/mqtt-credentials')).toBe(1)
  })

  it('exposes the cache synchronously for transformWsUrl', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { body: creds(NOW + 600_000) })
    expect(getCachedCredentials()).toBeNull()
    await ensureCredentials(NOW)
    expect(getCachedCredentials()?.password).toBe('p')
  })

  it('refetches when the cached credential is within the expiry skew', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { body: creds(NOW + 10_000) })
    await ensureCredentials(NOW)
    await ensureCredentials(NOW)
    expect(callCount('GET', '/api/iot/mqtt-credentials')).toBe(2)
  })

  it('collapses concurrent callers into one request', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { body: creds(NOW + 600_000) })
    await Promise.all([ensureCredentials(NOW), ensureCredentials(NOW), ensureCredentials(NOW)])
    expect(callCount('GET', '/api/iot/mqtt-credentials')).toBe(1)
  })

  it('clearCredentials empties the cache', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { body: creds(NOW + 600_000) })
    await ensureCredentials(NOW)
    clearCredentials()
    expect(getCachedCredentials()).toBeNull()
  })

  it('propagates a fetch failure and leaves the cache empty', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { status: 500 })
    await expect(ensureCredentials(NOW)).rejects.toMatchObject({ status: 500 })
    expect(getCachedCredentials()).toBeNull()
  })

  it('allows a retry after a failure', async () => {
    mockRoute('GET', '/api/iot/mqtt-credentials', { status: 500 })
    await expect(ensureCredentials(NOW)).rejects.toBeDefined()
    mockRoute('GET', '/api/iot/mqtt-credentials', { body: creds(NOW + 600_000) })
    await expect(ensureCredentials(NOW)).resolves.toMatchObject({ username: 'u' })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/mqtt/credentials.test.ts`
Expected: FAIL — cannot resolve `./credentials`

- [ ] **Step 7: Write credentials.ts**

```ts
// src/lib/mqtt/credentials.ts
import { apiFetch } from '@/lib/http/client'

export type MqttCredentials = {
  url: string
  clientId: string
  username: string
  password: string
  /** Epoch milliseconds. Readable, unlike the HttpOnly session cookie. */
  expiresAt: number
}

/** Refresh this far before actual expiry, so a reconnect never uses a dead credential. */
const SKEW_MS = 30_000

let cached: MqttCredentials | null = null
let inFlight: Promise<MqttCredentials> | null = null

export function getCachedCredentials(): MqttCredentials | null {
  return cached
}

export function clearCredentials(): void {
  cached = null
  inFlight = null
}

/**
 * Proactively refreshed into a cache, because transformWsUrl is synchronous
 * and cannot await. If the cache is somehow stale, the connect attempt fails
 * and MQTT.js retries with backoff while this fills it in.
 */
export function ensureCredentials(now: number = Date.now()): Promise<MqttCredentials> {
  if (cached && cached.expiresAt - SKEW_MS > now) return Promise.resolve(cached)
  if (inFlight) return inFlight

  inFlight = apiFetch<MqttCredentials>('/iot/mqtt-credentials')
    .then((next) => {
      cached = next
      return next
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/mqtt`
Expected: PASS (21 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/mqtt
git commit -m "feat: add MQTT topic registry, payload validation and credential cache"
```

---

## Task 15: MQTT client, fake transport and lifecycle

> **AMENDED 2026-09-07 by requirement change.** The credential fetch, the
> `transformWsUrl` refresh hook, and the `username`/`password` connect options
> are all **removed** — the frontend passes no credential to the broker and the
> session cookie rides the WebSocket upgrade. See spec §10.2. The superseding
> brief is
> `.superpowers/sdd/2026-09-07-react-base/task-15-brief-AMENDED.md`; the
> `client.ts` and test code below are obsolete in their credential-handling
> parts and were not executed as written.

**Files:**
- Create: `src/lib/mqtt/client.ts`, `src/lib/mqtt/connectionStore.ts`, `src/test/fakeMqtt.ts`
- Test: `src/lib/mqtt/client.test.ts`

**Interfaces:**
- Consumes: `ensureCredentials`/`getCachedCredentials`/`clearCredentials` (Task 14), `matchTopic` (Task 14), `authStore` (Task 4)
- Produces:
  - `type MqttLike` — the narrow surface the app uses
  - `setConnectFactory(fn: (url: string, opts: Record<string, unknown>) => MqttLike)`
  - `makeClientId(userId: string): string`
  - `connectMqtt(): Promise<void>`, `disconnectMqtt(): Promise<void>`, `getClient(): MqttLike | null`
  - `subscribeTopic(topic, handler): Promise<() => void>` — dispatcher registration
  - `publishTopic(topic, payload, qos?): Promise<void>`
  - `startMqttLifecycle(): () => void`
  - `connectionStore` / `useConnectionStore` with `status: 'offline' | 'connecting' | 'online'`
  - `FakeMqttClient` with `emitMessage`, `emitEvent`, `subscriptions`, `published`, `ended`

Connection is bound to auth status. The fake transport is injected through `setConnectFactory`, so no test ever mocks the `mqtt` module.

- [ ] **Step 1: Write the fake client**

```ts
// src/test/fakeMqtt.ts
import type { MqttLike } from '@/lib/mqtt/client'

type Handler = (...args: unknown[]) => void

export class FakeMqttClient implements MqttLike {
  options: Record<string, unknown>
  subscriptions = new Set<string>()
  published: { topic: string; payload: string; qos?: number }[] = []
  ended = false

  private handlers = new Map<string, Handler[]>()

  constructor(
    readonly url: string,
    options: Record<string, unknown> = {},
  ) {
    this.options = { ...options }
  }

  on(event: string, cb: Handler): this {
    const list = this.handlers.get(event) ?? []
    list.push(cb)
    this.handlers.set(event, list)
    return this
  }

  async subscribeAsync(topic: string): Promise<void> {
    this.subscriptions.add(topic)
  }

  async unsubscribeAsync(topic: string): Promise<void> {
    this.subscriptions.delete(topic)
  }

  async publishAsync(topic: string, payload: string, opts?: { qos?: number }): Promise<void> {
    this.published.push({ topic, payload, qos: opts?.qos })
  }

  async endAsync(): Promise<void> {
    this.ended = true
    this.emitEvent('close')
  }

  /** Drive a test: pretend the broker delivered a message. */
  emitMessage(topic: string, payload: unknown): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.emitEvent('message', topic, new TextEncoder().encode(body))
  }

  emitEvent(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args)
  }
}

/** Registry so a test can reach the client the code under test created. */
export const fakeClients: FakeMqttClient[] = []

export function fakeConnectFactory(url: string, opts: Record<string, unknown>): MqttLike {
  const client = new FakeMqttClient(url, opts)
  fakeClients.push(client)
  // Connect asynchronously, the way a real broker handshake behaves.
  queueMicrotask(() => client.emitEvent('connect'))
  return client
}

export function resetFakeClients(): void {
  fakeClients.length = 0
}

export const lastFakeClient = (): FakeMqttClient | undefined => fakeClients.at(-1)
```

- [ ] **Step 2: Write the failing client test**

```ts
// src/lib/mqtt/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { fakeConnectFactory, lastFakeClient, resetFakeClients } from '@/test/fakeMqtt'
import { authStore } from '@/lib/auth/store'
import { clearCredentials } from './credentials'
import { connectionStore } from './connectionStore'
import {
  connectMqtt,
  disconnectMqtt,
  getClient,
  makeClientId,
  publishTopic,
  setConnectFactory,
  startMqttLifecycle,
  subscribeTopic,
} from './client'
import { TOPICS } from './topics'

const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }

beforeEach(() => {
  installFetchMock()
  resetFakeClients()
  clearCredentials()
  setConnectFactory(fakeConnectFactory)
  authStore.getState().setUnauthenticated()
  mockRoute('GET', '/api/iot/mqtt-credentials', {
    body: {
      url: 'ws://localhost:9001/mqtt',
      clientId: 'ignored',
      username: 'u',
      password: 'p',
      expiresAt: Date.now() + 600_000,
    },
  })
})

afterEach(async () => {
  await disconnectMqtt()
  resetFetchMock()
})

describe('makeClientId', () => {
  it('is unique per call so two tabs cannot evict each other', () => {
    const a = makeClientId('u1')
    const b = makeClientId('u1')
    expect(a).not.toBe(b)
    expect(a.startsWith('u1-')).toBe(true)
  })
})

describe('connectMqtt', () => {
  it('connects with a clean session and a unique client id', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()
    expect(client).toBeDefined()
    expect(client!.options.clean).toBe(true)
    expect(String(client!.options.clientId)).toMatch(/^u1-/)
    expect(client!.options.username).toBe('u')
  })

  it('does nothing when unauthenticated', async () => {
    await connectMqtt()
    expect(getClient()).toBeNull()
  })

  it('reports online once the broker acknowledges', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    await vi.waitFor(() => expect(connectionStore.getState().status).toBe('online'))
  })

  it('does not create a second connection when already connected', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const first = getClient()
    await connectMqtt()
    expect(getClient()).toBe(first)
  })
})

describe('disconnectMqtt', () => {
  it('ends the client and drops it', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    await disconnectMqtt()
    expect(client.ended).toBe(true)
    expect(getClient()).toBeNull()
    expect(connectionStore.getState().status).toBe('offline')
  })
})

describe('message dispatch', () => {
  it('routes a message to a handler registered with a wildcard', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const handler = vi.fn()
    await subscribeTopic(TOPICS.allDeviceStatus(), handler)

    lastFakeClient()!.emitMessage('devices/d1/status', { deviceId: 'd1', online: true, ts: 1 })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toBe('devices/d1/status')
  })

  it('does not route a message to a non-matching handler', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const handler = vi.fn()
    await subscribeTopic(TOPICS.deviceTelemetry('d1'), handler)

    lastFakeClient()!.emitMessage('devices/d2/telemetry', { deviceId: 'd2', ts: 1, temp: 1 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribing stops delivery', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const handler = vi.fn()
    const off = await subscribeTopic(TOPICS.deviceTelemetry('d1'), handler)
    off()

    lastFakeClient()!.emitMessage('devices/d1/telemetry', { deviceId: 'd1', ts: 1, temp: 1 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('a throwing handler does not break dispatch for others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    authStore.getState().setSession(user)
    await connectMqtt()
    const good = vi.fn()
    await subscribeTopic(TOPICS.deviceTelemetry('d1'), () => {
      throw new Error('handler blew up')
    })
    await subscribeTopic(TOPICS.deviceTelemetry('d1'), good)

    expect(() =>
      lastFakeClient()!.emitMessage('devices/d1/telemetry', { deviceId: 'd1', ts: 1, temp: 1 }),
    ).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})

describe('publishTopic', () => {
  it('publishes commands at QoS 1', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    await publishTopic('devices/d1/cmd', { action: 'reboot' })
    expect(lastFakeClient()!.published[0]).toMatchObject({ topic: 'devices/d1/cmd', qos: 1 })
  })
})

describe('reconnect backoff', () => {
  it('grows reconnectPeriod on repeated reconnect attempts', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    const initial = Number(client.options.reconnectPeriod)

    client.emitEvent('reconnect')
    const after1 = Number(client.options.reconnectPeriod)
    client.emitEvent('reconnect')
    const after2 = Number(client.options.reconnectPeriod)

    expect(after1).toBeGreaterThan(initial)
    expect(after2).toBeGreaterThan(after1)
  })

  it('resets the backoff after a successful connect', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    const initial = Number(client.options.reconnectPeriod)
    client.emitEvent('reconnect')
    client.emitEvent('connect')
    expect(Number(client.options.reconnectPeriod)).toBe(initial)
  })
})

describe('startMqttLifecycle', () => {
  it('connects on login and disconnects on logout', async () => {
    const stop = startMqttLifecycle()

    authStore.getState().setSession(user)
    await vi.waitFor(() => expect(getClient()).not.toBeNull())
    const client = lastFakeClient()!

    authStore.getState().setUnauthenticated()
    await vi.waitFor(() => expect(client.ended).toBe(true))
    expect(getClient()).toBeNull()

    stop()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/mqtt/client.test.ts`
Expected: FAIL — cannot resolve `./client`

- [ ] **Step 4: Write connectionStore.ts**

```ts
// src/lib/mqtt/connectionStore.ts
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export type ConnectionStatus = 'offline' | 'connecting' | 'online'

type State = {
  status: ConnectionStatus
  setStatus: (status: ConnectionStatus) => void
}

export const connectionStore = createStore<State>()((set) => ({
  status: 'offline',
  setStatus: (status) => set({ status }),
}))

export function useConnectionStatus(): ConnectionStatus {
  return useStore(connectionStore, (s) => s.status)
}
```

- [ ] **Step 5: Write client.ts**

```ts
// src/lib/mqtt/client.ts
import { env } from '@/config/env'
import { authStore } from '@/lib/auth/store'
import { connectionStore } from './connectionStore'
import { clearCredentials, ensureCredentials, getCachedCredentials } from './credentials'
import { matchTopic } from './topics'

/** The narrow surface the app uses. Kept small so the fake is cheap to write. */
export type MqttLike = {
  options: Record<string, unknown>
  on(event: string, cb: (...args: unknown[]) => void): unknown
  subscribeAsync(topic: string, opts?: unknown): Promise<unknown>
  unsubscribeAsync(topic: string): Promise<unknown>
  publishAsync(topic: string, payload: string, opts?: unknown): Promise<unknown>
  endAsync(): Promise<unknown>
}

export type ConnectFactory = (url: string, opts: Record<string, unknown>) => MqttLike

const BASE_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 30_000

let factory: ConnectFactory | null = null
let client: MqttLike | null = null
let connecting: Promise<void> | null = null

type MessageHandler = (topic: string, payload: Uint8Array) => void
const handlers = new Map<string, Set<MessageHandler>>()

export function setConnectFactory(fn: ConnectFactory): void {
  factory = fn
}

async function realFactory(): Promise<ConnectFactory> {
  const mqtt = await import('mqtt')
  return (url, opts) => mqtt.connect(url, opts) as unknown as MqttLike
}

/**
 * Unique per tab. Brokers evict an existing session when a client reconnects
 * with the same id, so a shared id makes two tabs disconnect each other in a
 * loop.
 */
export function makeClientId(userId: string): string {
  return `${userId}-${crypto.randomUUID().slice(0, 8)}`
}

export function getClient(): MqttLike | null {
  return client
}

function dispatch(topic: string, payload: Uint8Array): void {
  for (const [pattern, set] of handlers) {
    if (!matchTopic(pattern, topic)) continue
    for (const handler of set) {
      try {
        handler(topic, payload)
      } catch (err) {
        // One bad handler must not stop the others or kill the connection.
        console.error('[mqtt] handler threw', err)
      }
    }
  }
}

export async function connectMqtt(): Promise<void> {
  if (authStore.getState().status !== 'authenticated') return
  if (client) return
  if (connecting) return connecting

  connecting = (async () => {
    const user = authStore.getState().user
    if (!user) return

    const creds = await ensureCredentials()
    const connect = factory ?? (await realFactory())

    connectionStore.getState().setStatus('connecting')

    const next = connect(creds.url || env.MQTT_URL, {
      clientId: makeClientId(user.id),
      username: creds.username,
      password: creds.password,
      // A browser is not a durable subscriber: a persistent session makes the
      // broker queue messages for tabs that closed days ago.
      clean: true,
      keepalive: 30,
      connectTimeout: 10_000,
      reconnectPeriod: BASE_RECONNECT_MS,
      // Synchronous by contract, so it reads the proactively-refreshed cache.
      transformWsUrl: (url: string, opts: Record<string, unknown>) => {
        const cached = getCachedCredentials()
        if (cached) {
          opts.username = cached.username
          opts.password = cached.password
          void ensureCredentials()
          return cached.url
        }
        void ensureCredentials()
        return url
      },
    })

    next.on('connect', () => {
      next.options.reconnectPeriod = BASE_RECONNECT_MS
      connectionStore.getState().setStatus('online')
    })
    next.on('reconnect', () => {
      // MQTT.js only supports a fixed period, so grow it by hand rather than
      // hammering a broker that is down.
      const current = Number(next.options.reconnectPeriod ?? BASE_RECONNECT_MS)
      next.options.reconnectPeriod = Math.min(current * 2, MAX_RECONNECT_MS)
      connectionStore.getState().setStatus('connecting')
    })
    next.on('close', () => connectionStore.getState().setStatus('offline'))
    next.on('offline', () => connectionStore.getState().setStatus('offline'))
    next.on('error', (err: unknown) => console.error('[mqtt] error', err))
    next.on('message', (...args: unknown[]) =>
      dispatch(args[0] as string, args[1] as Uint8Array),
    )

    client = next
  })().finally(() => {
    connecting = null
  })

  return connecting
}

export async function disconnectMqtt(): Promise<void> {
  const current = client
  client = null
  handlers.clear()
  clearCredentials()
  connectionStore.getState().setStatus('offline')
  if (current) await current.endAsync()
}

export async function subscribeTopic(
  topic: string,
  handler: MessageHandler,
  qos: 0 | 1 = 0,
): Promise<() => void> {
  const set = handlers.get(topic) ?? new Set<MessageHandler>()
  const isFirst = set.size === 0
  set.add(handler)
  handlers.set(topic, set)

  if (isFirst && client) await client.subscribeAsync(topic, { qos })

  return () => {
    const live = handlers.get(topic)
    if (!live) return
    live.delete(handler)
    if (live.size === 0) {
      handlers.delete(topic)
      void client?.unsubscribeAsync(topic)
    }
  }
}

/** Commands go at QoS 1 — delivery matters, unlike telemetry. */
export async function publishTopic(topic: string, payload: unknown, qos: 0 | 1 = 1): Promise<void> {
  if (!client) throw new Error('MQTT is not connected')
  await client.publishAsync(topic, JSON.stringify(payload), { qos })
}

/**
 * Binds the connection to the session, not to app mount. Leaving the socket
 * open after logout means the previous user keeps receiving telemetry.
 */
export function startMqttLifecycle(): () => void {
  const apply = (status: string) => {
    if (status === 'authenticated') void connectMqtt()
    else void disconnectMqtt()
  }

  apply(authStore.getState().status)
  return authStore.subscribe((s, prev) => {
    if (s.status !== prev.status) apply(s.status)
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/mqtt/client.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 7: Wire the lifecycle into the app**

In `src/main.tsx`, add the import and start the lifecycle after the hooks block:

```tsx
import { disconnectMqtt, startMqttLifecycle } from '@/lib/mqtt/client'
import { setConnectFactory } from '@/lib/mqtt/client'

// E2E swaps in the in-memory transport. Dynamically imported so the fake is
// not part of the production chunk.
if (env.MQTT_TRANSPORT === 'fake') {
  const { fakeConnectFactory, lastFakeClient } = await import('@/test/fakeMqtt')
  setConnectFactory(fakeConnectFactory)
  ;(window as unknown as Record<string, unknown>).__mqttFake = {
    emit: (topic: string, payload: unknown) => lastFakeClient()?.emitMessage(topic, payload),
  }
}

registerLogoutHandler(() => void disconnectMqtt())
startMqttLifecycle()
```

Add `import { env } from '@/config/env'` if not already present. Top-level `await` requires the module be treated as ESM, which it is under Vite.

- [ ] **Step 8: Run the suite and commit**

```bash
npm test
npm run typecheck
git add -A
git commit -m "feat: add MQTT client with auth-bound lifecycle and fake transport"
```

---

## Task 16: Telemetry batching, store and subscription hook

**Files:**
- Create: `src/lib/mqtt/batcher.ts`, `src/lib/mqtt/telemetryStore.ts`, `src/lib/mqtt/useMqttSubscription.ts`
- Test: `src/lib/mqtt/batcher.test.ts`, `src/lib/mqtt/telemetryStore.test.ts`, `src/lib/mqtt/useMqttSubscription.test.tsx`

**Interfaces:**
- Consumes: `subscribeTopic` (Task 15), `parsePayload`/`telemetrySchema`/`statusSchema` (Task 14), `usePermissions` (Task 8)
- Produces:
  - `class RingBuffer<T>` — `push`, `toArray`, `size`, `capacity`
  - `createBatcher<T>(flush, schedule?, cancel?)` → `{ push, flushNow, dispose }`
  - `telemetryStore` / `useTelemetryStore` with `latest`, `series`, `online`
  - `pushTelemetry(reading)`, `setOnline(deviceId, online)`, `resetTelemetry()`
  - `useMqttSubscription(topic, handler, opts?: { permission?: Permission })`

`schedule` and `cancel` are injected so the batching tests are deterministic — no fake timers, no real frames.

- [ ] **Step 1: Write the failing batcher test**

```ts
// src/lib/mqtt/batcher.test.ts
import { describe, expect, it, vi } from 'vitest'
import { RingBuffer, createBatcher } from './batcher'

/** Manual frame scheduler, so a test decides exactly when a flush happens. */
function manualScheduler() {
  const queue: (() => void)[] = []
  return {
    schedule: (cb: () => void) => {
      queue.push(cb)
      return queue.length
    },
    cancel: () => {},
    tick: () => {
      const pending = queue.splice(0)
      for (const cb of pending) cb()
    },
    pendingFrames: () => queue.length,
  }
}

describe('RingBuffer', () => {
  it('keeps items in order below capacity', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    expect(rb.toArray()).toEqual([1, 2])
    expect(rb.size).toBe(2)
  })

  it('drops the oldest item past capacity', () => {
    const rb = new RingBuffer<number>(3)
    for (const n of [1, 2, 3, 4, 5]) rb.push(n)
    expect(rb.toArray()).toEqual([3, 4, 5])
  })

  it('never exceeds its capacity', () => {
    const rb = new RingBuffer<number>(2)
    for (let i = 0; i < 1000; i += 1) rb.push(i)
    expect(rb.size).toBe(2)
    expect(rb.toArray()).toEqual([998, 999])
  })
})

describe('createBatcher', () => {
  it('collapses many pushes into one flush per frame', () => {
    const s = manualScheduler()
    const flush = vi.fn()
    const b = createBatcher<number>(flush, s.schedule, s.cancel)

    for (let i = 0; i < 500; i += 1) b.push('d1', i)
    expect(flush).not.toHaveBeenCalled()

    s.tick()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush.mock.calls[0][0].get('d1')).toBe(499)
  })

  it('coalesces to the latest value per key', () => {
    const s = manualScheduler()
    const flush = vi.fn()
    const b = createBatcher<number>(flush, s.schedule, s.cancel)

    b.push('d1', 1)
    b.push('d2', 10)
    b.push('d1', 2)
    s.tick()

    const batch = flush.mock.calls[0][0] as Map<string, number>
    expect(batch.size).toBe(2)
    expect(batch.get('d1')).toBe(2)
    expect(batch.get('d2')).toBe(10)
  })

  it('schedules only one frame for a burst', () => {
    const s = manualScheduler()
    const b = createBatcher<number>(vi.fn(), s.schedule, s.cancel)
    b.push('d1', 1)
    b.push('d1', 2)
    b.push('d2', 3)
    expect(s.pendingFrames()).toBe(1)
  })

  it('does not flush an empty buffer', () => {
    const s = manualScheduler()
    const flush = vi.fn()
    createBatcher<number>(flush, s.schedule, s.cancel)
    s.tick()
    expect(flush).not.toHaveBeenCalled()
  })

  it('starts a new frame for pushes after a flush', () => {
    const s = manualScheduler()
    const flush = vi.fn()
    const b = createBatcher<number>(flush, s.schedule, s.cancel)
    b.push('d1', 1)
    s.tick()
    b.push('d1', 2)
    s.tick()
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('flushNow flushes synchronously', () => {
    const s = manualScheduler()
    const flush = vi.fn()
    const b = createBatcher<number>(flush, s.schedule, s.cancel)
    b.push('d1', 7)
    b.flushNow()
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('dispose prevents a pending flush', () => {
    const s = manualScheduler()
    const flush = vi.fn()
    const b = createBatcher<number>(flush, s.schedule, s.cancel)
    b.push('d1', 1)
    b.dispose()
    s.tick()
    expect(flush).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mqtt/batcher.test.ts`
Expected: FAIL — cannot resolve `./batcher`

- [ ] **Step 3: Write batcher.ts**

```ts
// src/lib/mqtt/batcher.ts

/** Fixed-capacity buffer, so a charted series cannot grow until the tab dies. */
export class RingBuffer<T> {
  private items: T[] = []

  constructor(readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item)
    if (this.items.length > this.capacity) this.items.shift()
  }

  toArray(): T[] {
    return [...this.items]
  }

  get size(): number {
    return this.items.length
  }
}

export type Batcher<T> = {
  push: (key: string, value: T) => void
  flushNow: () => void
  dispose: () => void
}

/**
 * Turns an unbounded message rate into a bounded commit rate. Messages land in
 * a plain Map outside React; one frame later the whole batch is committed once.
 * 50 devices at 10Hz becomes ~60 commits/sec instead of 500.
 *
 * `schedule`/`cancel` are injectable so tests can drive frames deterministically.
 */
export function createBatcher<T>(
  flush: (batch: Map<string, T>) => void,
  schedule: (cb: () => void) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): Batcher<T> {
  let buffer = new Map<string, T>()
  let frame: number | null = null
  let disposed = false

  const run = () => {
    frame = null
    if (buffer.size === 0) return
    const batch = buffer
    buffer = new Map<string, T>()
    flush(batch)
  }

  return {
    push(key, value) {
      if (disposed) return
      buffer.set(key, value)
      if (frame === null) frame = schedule(run)
    },
    flushNow() {
      if (frame !== null) {
        cancel(frame)
        frame = null
      }
      run()
    },
    dispose() {
      disposed = true
      if (frame !== null) cancel(frame)
      frame = null
      buffer = new Map<string, T>()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mqtt/batcher.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Write the failing telemetry store test**

```ts
// src/lib/mqtt/telemetryStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { SERIES_CAPACITY, pushTelemetry, resetTelemetry, setOnline, telemetryStore } from './telemetryStore'

const reading = (deviceId: string, ts: number, temp: number) => ({ deviceId, ts, temp })

beforeEach(() => resetTelemetry())

describe('telemetryStore', () => {
  it('records the latest reading per device', () => {
    pushTelemetry(reading('d1', 1, 20))
    pushTelemetry(reading('d1', 2, 21))
    pushTelemetry(reading('d2', 1, 30))

    const s = telemetryStore.getState()
    expect(s.latest.d1).toMatchObject({ ts: 2, temp: 21 })
    expect(s.latest.d2).toMatchObject({ temp: 30 })
  })

  it('appends to a per-device series', () => {
    pushTelemetry(reading('d1', 1, 20))
    pushTelemetry(reading('d1', 2, 21))
    expect(telemetryStore.getState().series.d1.toArray()).toHaveLength(2)
  })

  it('bounds the series at the configured capacity', () => {
    for (let i = 0; i < SERIES_CAPACITY + 50; i += 1) pushTelemetry(reading('d1', i, i))
    expect(telemetryStore.getState().series.d1.size).toBe(SERIES_CAPACITY)
  })

  it('tracks online status separately from readings', () => {
    setOnline('d1', true)
    setOnline('d2', false)
    expect(telemetryStore.getState().online).toEqual({ d1: true, d2: false })
  })

  it('resetTelemetry clears everything', () => {
    pushTelemetry(reading('d1', 1, 20))
    setOnline('d1', true)
    resetTelemetry()
    const s = telemetryStore.getState()
    expect(s.latest).toEqual({})
    expect(s.online).toEqual({})
  })

  it('changes the latest object identity so selectors re-render', () => {
    pushTelemetry(reading('d1', 1, 20))
    const before = telemetryStore.getState().latest
    pushTelemetry(reading('d1', 2, 21))
    expect(telemetryStore.getState().latest).not.toBe(before)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/mqtt/telemetryStore.test.ts`
Expected: FAIL — cannot resolve `./telemetryStore`

- [ ] **Step 7: Write telemetryStore.ts**

```ts
// src/lib/mqtt/telemetryStore.ts
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { RingBuffer } from './batcher'
import type { Telemetry } from './topics'

/** Points retained per device for charting. */
export const SERIES_CAPACITY = 300

type State = {
  latest: Record<string, Telemetry>
  series: Record<string, RingBuffer<Telemetry>>
  online: Record<string, boolean>
}

export const telemetryStore = createStore<State>()(() => ({
  latest: {},
  series: {},
  online: {},
}))

/**
 * Telemetry lives here rather than in the Query cache: it is high-frequency
 * push, not request/response.
 */
export function pushTelemetry(reading: Telemetry): void {
  const { latest, series } = telemetryStore.getState()
  const buffer = series[reading.deviceId] ?? new RingBuffer<Telemetry>(SERIES_CAPACITY)
  buffer.push(reading)

  telemetryStore.setState({
    // New object identity so Zustand selectors see the change.
    latest: { ...latest, [reading.deviceId]: reading },
    series: { ...series, [reading.deviceId]: buffer },
  })
}

export function pushTelemetryBatch(batch: Map<string, Telemetry>): void {
  for (const reading of batch.values()) pushTelemetry(reading)
}

export function setOnline(deviceId: string, online: boolean): void {
  telemetryStore.setState({ online: { ...telemetryStore.getState().online, [deviceId]: online } })
}

export function resetTelemetry(): void {
  telemetryStore.setState({ latest: {}, series: {}, online: {} })
}

export function useTelemetryStore<T>(selector: (s: State) => T): T {
  return useStore(telemetryStore, selector)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/mqtt/telemetryStore.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Write the failing subscription hook test**

```tsx
// src/lib/mqtt/useMqttSubscription.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { fakeConnectFactory, lastFakeClient, resetFakeClients } from '@/test/fakeMqtt'
import { authStore } from '@/lib/auth/store'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { connectMqtt, disconnectMqtt, setConnectFactory } from './client'
import { clearCredentials } from './credentials'
import { TOPICS } from './topics'
import { useMqttSubscription } from './useMqttSubscription'

const admin = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }
const viewer = { id: 'u2', email: 'v@b.co', name: 'Vic', roles: ['viewer'] }

beforeEach(async () => {
  installFetchMock()
  resetFakeClients()
  clearCredentials()
  setConnectFactory(fakeConnectFactory)
  mockRoute('GET', '/api/iot/mqtt-credentials', {
    body: {
      url: 'ws://localhost:9001/mqtt',
      clientId: 'x',
      username: 'u',
      password: 'p',
      expiresAt: Date.now() + 600_000,
    },
  })
})

afterEach(async () => {
  await disconnectMqtt()
  resetFetchMock()
})

function Probe({ permission }: { permission?: typeof PERMISSIONS.DEVICE_DELETE }) {
  useMqttSubscription(TOPICS.deviceTelemetry('d1'), handlerSpy, { permission })
  return null
}

const handlerSpy = vi.fn()

describe('useMqttSubscription', () => {
  beforeEach(() => handlerSpy.mockClear())

  it('delivers matching messages to the handler', async () => {
    authStore.getState().setSession(admin)
    await connectMqtt()
    render(<Probe />)

    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBeGreaterThan(0))
    lastFakeClient()!.emitMessage('devices/d1/telemetry', { deviceId: 'd1', ts: 1, temp: 20 })

    await waitFor(() => expect(handlerSpy).toHaveBeenCalledTimes(1))
  })

  it('does not subscribe without the required permission', async () => {
    authStore.getState().setSession(viewer)
    await connectMqtt()
    render(<Probe permission={PERMISSIONS.DEVICE_DELETE} />)

    await new Promise((r) => setTimeout(r, 10))
    expect(lastFakeClient()!.subscriptions.size).toBe(0)
  })

  it('unsubscribes on unmount', async () => {
    authStore.getState().setSession(admin)
    await connectMqtt()
    const { unmount } = render(<Probe />)
    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBe(1))

    unmount()
    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBe(0))
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run src/lib/mqtt/useMqttSubscription.test.tsx`
Expected: FAIL — cannot resolve `./useMqttSubscription`

- [ ] **Step 11: Write useMqttSubscription.ts**

```ts
// src/lib/mqtt/useMqttSubscription.ts
import { useEffect, useRef } from 'react'
import { usePermissions } from '@/lib/rbac/usePermissions'
import type { Permission } from '@/lib/rbac/permissions'
import { subscribeTopic } from './client'
import { useConnectionStatus } from './connectionStore'

type Handler = (topic: string, payload: Uint8Array) => void

/**
 * Component-scoped subscription. The permission check prevents accidental
 * subscribes; the broker's topic ACL is what actually enforces access.
 */
export function useMqttSubscription(
  topic: string,
  handler: Handler,
  opts: { permission?: Permission; qos?: 0 | 1 } = {},
): void {
  const { can } = usePermissions()
  const status = useConnectionStatus()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const allowed = opts.permission === undefined || can(opts.permission)

  useEffect(() => {
    if (!allowed) return
    if (status !== 'online') return

    let off: (() => void) | undefined
    let cancelled = false

    void subscribeTopic(topic, (t, p) => handlerRef.current(t, p), opts.qos ?? 0).then((fn) => {
      if (cancelled) fn()
      else off = fn
    })

    return () => {
      cancelled = true
      off?.()
    }
  }, [topic, allowed, status, opts.qos])
}
```

- [ ] **Step 12: Run the MQTT suite and commit**

Run: `npx vitest run src/lib/mqtt`
Expected: PASS (51 tests)

```bash
git add src/lib/mqtt
git commit -m "feat: add rAF-batched telemetry store and subscription hook"
```

---

## Task 17: Devices feature and nested sub-routes

**Files:**
- Create: `src/modules/devices/api.ts`, `src/modules/devices/queries.ts`, `src/modules/devices/components/DeviceTable.tsx`, `src/modules/devices/useDeviceEvents.ts`
- Create: `src/routes/_auth.devices.tsx`, `src/routes/_auth.devices.index.tsx`, `src/routes/_auth.devices.$id.tsx`, `src/routes/_auth.devices.$id.index.tsx`, `src/routes/_auth.devices.$id.settings.tsx`
- Modify: `src/app/routing.test.tsx` (un-skip the redirect-bounce test)
- Test: `src/modules/devices/devices.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`/`HttpError` (Task 5), `requirePermission` (Task 9), `Can` (Task 8), UI primitives (Task 10), `subscribeTopic`/`deviceEventSchema` (Tasks 14–15), `renderRoute`/`signIn` (Task 11)
- Produces:
  - `type Device = { id: string; name: string; location: string; firmware: string }`
  - `deviceKeys = { all: ['devices'], detail: (id) => ['devices', id] }`
  - `listDevices()`, `getDevice(id)`, `updateDevice(id, patch)`, `deleteDevice(id)`
  - `useDevices()`, `useDevice(id)`, `useUpdateDevice(id)`, `useDeleteDevice()`
  - `useDeviceEvents()` — MQTT events → Query invalidation
  - Routes `/devices`, `/devices/:id`, `/devices/:id/settings`

The demo slice that proves the whole design: nested guards, a loader that throws `notFound()`, element-level gating, and the events-invalidate-Query rule.

- [ ] **Step 1: Write the API and query layer**

```ts
// src/modules/devices/api.ts
import { apiFetch } from '@/lib/http/client'

export type Device = {
  id: string
  name: string
  location: string
  firmware: string
}

export const listDevices = () => apiFetch<Device[]>('/devices')
export const getDevice = (id: string) => apiFetch<Device>(`/devices/${id}`)
export const updateDevice = (id: string, patch: Partial<Device>) =>
  apiFetch<Device>(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteDevice = (id: string) =>
  apiFetch<void>(`/devices/${id}`, { method: 'DELETE' })
```

```ts
// src/modules/devices/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteDevice, getDevice, listDevices, updateDevice, type Device } from './api'

export const deviceKeys = {
  all: ['devices'] as const,
  detail: (id: string) => ['devices', id] as const,
}

export const devicesQueryOptions = () => ({
  queryKey: deviceKeys.all,
  queryFn: listDevices,
})

export const deviceQueryOptions = (id: string) => ({
  queryKey: deviceKeys.detail(id),
  queryFn: () => getDevice(id),
})

export const useDevices = () => useQuery(devicesQueryOptions())
export const useDevice = (id: string) => useQuery(deviceQueryOptions(id))

export function useUpdateDevice(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Device>) => updateDevice(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: deviceKeys.all })
      void qc.invalidateQueries({ queryKey: deviceKeys.detail(id) })
    },
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}
```

- [ ] **Step 2: Write the MQTT-events-to-Query bridge**

The one place MQTT is allowed to touch the Query cache — because a registration or deletion is a statement about REST data, not a reading.

```ts
// src/modules/devices/useDeviceEvents.ts
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMqttSubscription } from '@/lib/mqtt/useMqttSubscription'
import { TOPICS, deviceEventSchema, parsePayload } from '@/lib/mqtt/topics'
import { deviceKeys } from './queries'

/**
 * Events may invalidate Query; telemetry goes to Zustand. A device being
 * registered or deleted changes the REST list, so it invalidates.
 */
export function useDeviceEvents(): void {
  const qc = useQueryClient()

  const handler = useCallback(
    (_topic: string, payload: Uint8Array) => {
      const event = parsePayload(deviceEventSchema, payload)
      if (!event) return
      void qc.invalidateQueries({ queryKey: deviceKeys.all })
      if (event.type === 'deleted') {
        qc.removeQueries({ queryKey: deviceKeys.detail(event.deviceId) })
      }
    },
    [qc],
  )

  useMqttSubscription(TOPICS.deviceEvents(), handler)
}
```

- [ ] **Step 3: Write the device table**

```tsx
// src/modules/devices/components/DeviceTable.tsx
import { Link } from '@tanstack/react-router'
import { Can } from '@/lib/rbac/Can'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { Table, Td, Th } from '@/modules/global/components/Table'
import { Button } from '@/modules/global/components/Button'
import { Badge } from '@/modules/global/components/Badge'
import { useTelemetryStore } from '@/lib/mqtt/telemetryStore'
import type { Device } from '../api'
import { useDeleteDevice } from '../queries'

export function DeviceTable({ devices }: { devices: Device[] }) {
  const online = useTelemetryStore((s) => s.online)
  const del = useDeleteDevice()

  return (
    <Table>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Location</Th>
          <Th>Status</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {devices.map((device) => (
          <tr key={device.id}>
            <Td>
              <Link to="/devices/$id" params={{ id: device.id }} className="underline">
                {device.name}
              </Link>
            </Td>
            <Td>{device.location}</Td>
            <Td>
              <Badge tone={online[device.id] ? 'ok' : 'neutral'}>
                {online[device.id] ? 'online' : 'unknown'}
              </Badge>
            </Td>
            <Td>
              {/* The demo's only element-level gate. Hides the control; the
                  API is what actually refuses the delete. */}
              <Can permission={PERMISSIONS.DEVICE_DELETE}>
                <Button
                  variant="danger"
                  loading={del.isPending}
                  onClick={() => del.mutate(device.id)}
                >
                  Delete
                </Button>
              </Can>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
```

- [ ] **Step 4: Write the routes**

```tsx
// src/routes/_auth.devices.tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/rbac/guards'
import { PERMISSIONS } from '@/lib/rbac/permissions'

export const Route = createFileRoute('/_auth/devices')({
  beforeLoad: requirePermission(PERMISSIONS.DEVICE_VIEW),
  component: () => <Outlet />,
})
```

```tsx
// src/routes/_auth.devices.index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useDevices } from '@/modules/devices/queries'
import { useDeviceEvents } from '@/modules/devices/useDeviceEvents'
import { DeviceTable } from '@/modules/devices/components/DeviceTable'
import { Spinner } from '@/modules/global/components/Spinner'
import { Alert } from '@/modules/global/components/Alert'

function DevicesPage() {
  const { data, isPending, isError } = useDevices()
  useDeviceEvents()

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Devices</h1>
      <div className="mt-4">
        {/* Component-level query errors render inline, so one failing panel
            does not replace the whole page with an error screen. */}
        {isPending && <Spinner />}
        {isError && <Alert tone="error">Could not load devices.</Alert>}
        {data && <DeviceTable devices={data} />}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_auth/devices/')({
  component: DevicesPage,
})
```

```tsx
// src/routes/_auth.devices.$id.tsx
import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { HttpError } from '@/lib/http/client'
import { deviceQueryOptions } from '@/modules/devices/queries'

export const Route = createFileRoute('/_auth/devices/$id')({
  // Loaders throw, so a failure becomes an error page rather than a broken
  // component. A 404 becomes the in-shell not-found state.
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(deviceQueryOptions(params.id))
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw notFound()
      throw err
    }
  },
  component: DeviceDetailLayout,
})

function DeviceDetailLayout() {
  const device = Route.useLoaderData()
  const { id } = Route.useParams()

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{device.name}</h1>
      <nav aria-label="Device sections" className="mt-4 flex gap-4 border-b border-slate-200">
        <Link
          to="/devices/$id"
          params={{ id }}
          activeOptions={{ exact: true }}
          activeProps={{ className: 'border-b-2 border-slate-900 pb-2 text-sm font-medium' }}
          className="pb-2 text-sm text-slate-600"
        >
          Overview
        </Link>
        <Link
          to="/devices/$id/settings"
          params={{ id }}
          activeProps={{ className: 'border-b-2 border-slate-900 pb-2 text-sm font-medium' }}
          className="pb-2 text-sm text-slate-600"
        >
          Settings
        </Link>
      </nav>
      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  )
}
```

```tsx
// src/routes/_auth.devices.$id.index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useTelemetryStore } from '@/lib/mqtt/telemetryStore'
import { Route as DetailRoute } from './_auth.devices.$id'

function DeviceOverview() {
  const { id } = DetailRoute.useParams()
  const device = DetailRoute.useLoaderData()
  const latest = useTelemetryStore((s) => s.latest[id])

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt className="text-slate-500">Location</dt>
      <dd>{device.location}</dd>
      <dt className="text-slate-500">Firmware</dt>
      <dd>{device.firmware}</dd>
      <dt className="text-slate-500">Latest temperature</dt>
      <dd>{latest ? `${latest.temp}°C` : '—'}</dd>
    </dl>
  )
}

export const Route = createFileRoute('/_auth/devices/$id/')({
  component: DeviceOverview,
})
```

```tsx
// src/routes/_auth.devices.$id.settings.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { requirePermission } from '@/lib/rbac/guards'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { useUpdateDevice } from '@/modules/devices/queries'
import { Input } from '@/modules/global/components/Input'
import { Button } from '@/modules/global/components/Button'
import { Alert } from '@/modules/global/components/Alert'
import { Route as DetailRoute } from './_auth.devices.$id'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
})

function DeviceSettings() {
  const { id } = DetailRoute.useParams()
  const device = DetailRoute.useLoaderData()
  const update = useUpdateDevice(id)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: device.name, location: device.location },
  })

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await update.mutateAsync(values)
      })}
      noValidate
      className="flex max-w-sm flex-col gap-4"
    >
      <h2 className="text-lg font-medium">Settings</h2>
      {update.isError && <Alert tone="error">Could not save changes.</Alert>}
      {update.isSuccess && <Alert tone="info">Saved.</Alert>}
      <Input label="Name" error={errors.name?.message} {...register('name')} />
      <Input label="Location" error={errors.location?.message} {...register('location')} />
      <Button type="submit" loading={isSubmitting || update.isPending}>
        Save
      </Button>
    </form>
  )
}

export const Route = createFileRoute('/_auth/devices/$id/settings')({
  beforeLoad: requirePermission(PERMISSIONS.DEVICE_WRITE),
  component: DeviceSettings,
})
```

- [ ] **Step 5: Write the failing feature test**

```tsx
// src/modules/devices/devices.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

const devices = [
  { id: 'd1', name: 'Boiler', location: 'Plant A', firmware: '1.2.0' },
  { id: 'd2', name: 'Chiller', location: 'Plant B', firmware: '1.1.0' },
]

beforeEach(() => {
  installFetchMock()
  authStore.getState().setUnauthenticated()
  mockRoute('GET', '/api/devices', { body: devices })
  mockRoute('GET', '/api/devices/d1', { body: devices[0] })
  mockRoute('GET', '/api/devices/d999', { status: 404, body: { message: 'no such device' } })
})
afterEach(() => resetFetchMock())

describe('/devices', () => {
  it('lists devices for a viewer', async () => {
    signIn(['viewer'])
    renderRoute('/devices')
    expect(await screen.findByRole('link', { name: 'Boiler' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chiller' })).toBeInTheDocument()
  })

  it('redirects a role without device.view to /forbidden', async () => {
    signIn(['unknown-role'])
    const { router } = renderRoute('/devices')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('hides the delete button from an operator', async () => {
    signIn(['operator'])
    renderRoute('/devices')
    await screen.findByRole('link', { name: 'Boiler' })
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows the delete button to an admin', async () => {
    signIn(['admin'])
    renderRoute('/devices')
    await screen.findByRole('link', { name: 'Boiler' })
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
  })
})

describe('/devices/:id', () => {
  it('renders the device detail with tabs', async () => {
    signIn(['operator'])
    renderRoute('/devices/d1')
    expect(await screen.findByRole('heading', { name: 'Boiler' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders the in-shell not-found state for a missing device', async () => {
    signIn(['operator'])
    renderRoute('/devices/d999')
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })
})

describe('/devices/:id/settings', () => {
  it('lets an operator open settings', async () => {
    signIn(['operator'])
    const { router } = renderRoute('/devices/d1/settings')
    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/devices/d1/settings')
  })

  it('redirects a viewer to /forbidden', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/devices/d1/settings')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('does not fetch the device when the permission guard rejects', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/devices/d1/settings')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    // beforeLoad runs before loader, so no request should have been made.
    const { callCount } = await import('@/test/http')
    expect(callCount('GET', '/api/devices/d1')).toBe(0)
  })
})
```

The last test is the one that proves spec §8.2 — the guard runs before the loader, so an unauthorized user never triggers the fetch.

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `npx vitest run src/modules/devices/devices.test.tsx`
Expected: FAIL first (routes not generated), then after `npx tsr generate`, PASS (9 tests).

```bash
npx tsr generate || npm run build
npx vitest run src/modules/devices/devices.test.tsx
```

- [ ] **Step 7: Un-skip the redirect-bounce test**

In `src/app/routing.test.tsx`, change `it.skip(` back to `it(` for "returns the user to the page they originally asked for", then add the device route stub to that describe block's `beforeEach`:

```ts
mockRoute('GET', '/api/devices/42', {
  body: { id: '42', name: 'Boiler', location: 'Plant A', firmware: '1.0.0' },
})
```

Run: `npx vitest run src/app/routing.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 8: Remove the AppShell `to` cast if it was added**

If Task 12 Step 9 required `to={item.to as never}`, remove the cast now and re-run typecheck — `/devices` exists in the generated tree.

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add devices feature with nested guarded sub-routes"
```

---

## Task 18: Admin users, dashboard telemetry and connection badge

**Files:**
- Create: `src/modules/users/api.ts`, `src/modules/users/queries.ts`, `src/modules/devices/components/TelemetryPanel.tsx`
- Create: `src/routes/_auth.admin.tsx`, `src/routes/_auth.admin.users.tsx`
- Modify: `src/routes/_auth.index.tsx` (mount the telemetry panel), `src/components/AppShell.tsx` (connection badge)
- Test: `src/modules/users/users.test.tsx`, `src/modules/devices/TelemetryPanel.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 5), `requirePermission` (Task 9), `useMqttSubscription`/`pushTelemetry`/`createBatcher`/`useConnectionStatus` (Tasks 15–16)
- Produces:
  - `type AppUser = { id: string; email: string; name: string; roles: string[] }`
  - `useUsers()`
  - `<TelemetryPanel />` — live readings, rAF-batched
  - Route `/admin/users`

Closes out the demo slice and puts the batcher on screen.

- [ ] **Step 1: Write the users API, queries and routes**

```ts
// src/modules/users/api.ts
import { apiFetch } from '@/lib/http/client'

export type AppUser = {
  id: string
  email: string
  name: string
  roles: string[]
}

export const listUsers = () => apiFetch<AppUser[]>('/users')
```

```ts
// src/modules/users/queries.ts
import { useQuery } from '@tanstack/react-query'
import { listUsers } from './api'

export const userKeys = { all: ['users'] as const }

export const useUsers = () => useQuery({ queryKey: userKeys.all, queryFn: listUsers })
```

```tsx
// src/routes/_auth.admin.tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/rbac/guards'
import { PERMISSIONS } from '@/lib/rbac/permissions'

export const Route = createFileRoute('/_auth/admin')({
  beforeLoad: requirePermission(PERMISSIONS.USER_MANAGE),
  component: () => <Outlet />,
})
```

```tsx
// src/routes/_auth.admin.users.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useUsers } from '@/modules/users/queries'
import { Table, Td, Th } from '@/modules/global/components/Table'
import { Badge } from '@/modules/global/components/Badge'
import { Spinner } from '@/modules/global/components/Spinner'
import { Alert } from '@/modules/global/components/Alert'

function UsersPage() {
  const { data, isPending, isError } = useUsers()

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <div className="mt-4">
        {isPending && <Spinner />}
        {isError && <Alert tone="error">Could not load users.</Alert>}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Roles</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <Td>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td>
                    <span className="flex gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r}>{r}</Badge>
                      ))}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_auth/admin/users')({
  component: UsersPage,
})
```

- [ ] **Step 2: Write the telemetry panel**

The batcher is created once per mount and disposed on unmount, so a burst of readings commits once per frame rather than once per message.

```tsx
// src/modules/devices/components/TelemetryPanel.tsx
import { useCallback, useEffect, useMemo } from 'react'
import { createBatcher } from '@/lib/mqtt/batcher'
import { pushTelemetryBatch, useTelemetryStore } from '@/lib/mqtt/telemetryStore'
import { useMqttSubscription } from '@/lib/mqtt/useMqttSubscription'
import { TOPICS, parsePayload, statusSchema, telemetrySchema, type Telemetry } from '@/lib/mqtt/topics'
import { setOnline } from '@/lib/mqtt/telemetryStore'
import { Table, Td, Th } from '@/modules/global/components/Table'

export function TelemetryPanel() {
  const batcher = useMemo(() => createBatcher<Telemetry>(pushTelemetryBatch), [])
  useEffect(() => () => batcher.dispose(), [batcher])

  const onTelemetry = useCallback(
    (_topic: string, payload: Uint8Array) => {
      const reading = parsePayload(telemetrySchema, payload)
      if (reading) batcher.push(reading.deviceId, reading)
    },
    [batcher],
  )

  const onStatus = useCallback((_topic: string, payload: Uint8Array) => {
    const status = parsePayload(statusSchema, payload)
    if (status) setOnline(status.deviceId, status.online)
  }, [])

  useMqttSubscription('devices/+/telemetry', onTelemetry)
  useMqttSubscription(TOPICS.allDeviceStatus(), onStatus)

  const latest = useTelemetryStore((s) => s.latest)
  const rows = Object.entries(latest)

  return (
    <section>
      <h2 className="text-lg font-medium">Live telemetry</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Waiting for readings…</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Device</Th>
              <Th>Temperature</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, reading]) => (
              <tr key={id}>
                <Td>{id}</Td>
                <Td>{reading.temp}°C</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Mount the panel on the dashboard**

```tsx
// src/routes/_auth.index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { TelemetryPanel } from '@/modules/devices/components/TelemetryPanel'

export const Route = createFileRoute('/_auth/')({
  component: () => (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <TelemetryPanel />
    </div>
  ),
})
```

- [ ] **Step 4: Add the connection badge to the shell**

In `src/components/AppShell.tsx`, add the import and render it in the header before the user name:

```tsx
import { useConnectionStatus } from '@/lib/mqtt/connectionStore'
import { Badge } from '@/modules/global/components/Badge'

// inside AppShell():
const connection = useConnectionStatus()

// inside <header>, before the user name span:
<Badge tone={connection === 'online' ? 'ok' : connection === 'connecting' ? 'warn' : 'error'}>
  {connection}
</Badge>
```

- [ ] **Step 5: Write the failing tests**

```tsx
// src/modules/users/users.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => {
  installFetchMock()
  authStore.getState().setUnauthenticated()
  mockRoute('GET', '/api/users', {
    body: [{ id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }],
  })
})
afterEach(() => resetFetchMock())

describe('/admin/users', () => {
  it('renders the user table for an admin', async () => {
    signIn(['admin'])
    renderRoute('/admin/users')
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(await screen.findByText('a@b.co')).toBeInTheDocument()
  })

  it('redirects an operator to /forbidden', async () => {
    signIn(['operator'])
    const { router } = renderRoute('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('redirects a viewer to /forbidden', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('does not fetch users when the guard rejects', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    const { callCount } = await import('@/test/http')
    expect(callCount('GET', '/api/users')).toBe(0)
  })
})
```

```tsx
// src/modules/devices/TelemetryPanel.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { fakeConnectFactory, lastFakeClient, resetFakeClients } from '@/test/fakeMqtt'
import { authStore } from '@/lib/auth/store'
import { connectMqtt, disconnectMqtt, setConnectFactory } from '@/lib/mqtt/client'
import { clearCredentials } from '@/lib/mqtt/credentials'
import { resetTelemetry } from '@/lib/mqtt/telemetryStore'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => {
  installFetchMock()
  resetFakeClients()
  clearCredentials()
  resetTelemetry()
  setConnectFactory(fakeConnectFactory)
  authStore.getState().setUnauthenticated()
  mockRoute('GET', '/api/iot/mqtt-credentials', {
    body: {
      url: 'ws://localhost:9001/mqtt',
      clientId: 'x',
      username: 'u',
      password: 'p',
      expiresAt: Date.now() + 600_000,
    },
  })
})

afterEach(async () => {
  await disconnectMqtt()
  resetFetchMock()
})

describe('<TelemetryPanel>', () => {
  it('shows a waiting state before any reading arrives', async () => {
    signIn(['viewer'])
    renderRoute('/')
    expect(await screen.findByText(/waiting for readings/i)).toBeInTheDocument()
  })

  it('renders a reading delivered over MQTT', async () => {
    signIn(['viewer'])
    await connectMqtt()
    renderRoute('/')
    await screen.findByText(/waiting for readings/i)

    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBeGreaterThan(0))
    lastFakeClient()!.emitMessage('devices/d1/telemetry', {
      deviceId: 'd1',
      ts: Date.now(),
      temp: 42,
    })

    expect(await screen.findByText('42°C')).toBeInTheDocument()
  })

  it('shows only the most recent value after a burst', async () => {
    signIn(['viewer'])
    await connectMqtt()
    renderRoute('/')
    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBeGreaterThan(0))

    for (let i = 1; i <= 20; i += 1) {
      lastFakeClient()!.emitMessage('devices/d1/telemetry', {
        deviceId: 'd1',
        ts: i,
        temp: i,
      })
    }

    expect(await screen.findByText('20°C')).toBeInTheDocument()
    expect(screen.queryByText('19°C')).not.toBeInTheDocument()
  })
})
```

The third test is the batcher's behaviour observed from the outside: twenty messages, one visible value, no intermediate renders.

- [ ] **Step 6: Generate routes, run tests**

```bash
npx tsr generate || npm run build
npx vitest run src/modules
```

Expected: PASS (16 tests across devices, users, telemetry)

If the burst test flakes, it is because jsdom's `requestAnimationFrame` timing varies — the assertion uses `findByText`, which retries, so a flake here means the batcher is committing per-message instead of per-frame. Check `TelemetryPanel` creates the batcher inside `useMemo` and not per render.

- [ ] **Step 7: Run the full suite and commit**

```bash
npm test
npm run lint
npm run typecheck
git add -A
git commit -m "feat: add admin users page, telemetry panel and connection badge"
```

---

## Task 19: Playwright end-to-end tests

**Files:**
- Create: `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/auth.spec.ts`, `e2e/rbac.spec.ts`, `e2e/errors.spec.ts`, `e2e/telemetry.spec.ts`
- Modify: `package.json` (e2e scripts)

**Interfaces:**
- Consumes: the built app; `window.__mqttFake.emit` (Task 15 Step 7)
- Produces: `npm run e2e`, `stubApi(page, opts)` fixture

REST is intercepted with `page.route`, including `Set-Cookie` so the cookie round-trip is real. MQTT uses the fake transport selected by `VITE_MQTT_TRANSPORT=fake`.

- [ ] **Step 1: Install Playwright**

```bash
npm i -D @playwright/test@latest
npx playwright install chromium
npm pkg set scripts.e2e="playwright test"
npm pkg set scripts.e2e:ui="playwright test --ui"
```

- [ ] **Step 2: Write the config**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_URL: '/api',
      VITE_MQTT_URL: 'ws://localhost:9001/mqtt',
      VITE_MQTT_TRANSPORT: 'fake',
      VITE_ENABLE_CSRF: 'false',
    },
  },
})
```

- [ ] **Step 3: Write the API fixture**

```ts
// e2e/fixtures.ts
import type { Page } from '@playwright/test'

export type Role = 'admin' | 'operator' | 'viewer'

const USERS: Record<Role, { id: string; email: string; name: string; roles: string[] }> = {
  admin: { id: 'u1', email: 'admin@example.com', name: 'Ada Admin', roles: ['admin'] },
  operator: { id: 'u2', email: 'op@example.com', name: 'Otto Operator', roles: ['operator'] },
  viewer: { id: 'u3', email: 'view@example.com', name: 'Vic Viewer', roles: ['viewer'] },
}

const DEVICES = [
  { id: 'd1', name: 'Boiler', location: 'Plant A', firmware: '1.2.0' },
  { id: 'd2', name: 'Chiller', location: 'Plant B', firmware: '1.1.0' },
]

/**
 * Stubs the whole API surface. `signedIn` controls what /auth/me returns, so a
 * test can start logged out and log in through the real form.
 */
export async function stubApi(
  page: Page,
  opts: { role?: Role; signedIn?: boolean; loginStatus?: number } = {},
): Promise<void> {
  const role = opts.role ?? 'admin'
  let signedIn = opts.signedIn ?? false
  const user = USERS[role]

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = route.request().method()

    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      })

    if (path === '/auth/login' && method === 'POST') {
      const status = opts.loginStatus ?? 200
      if (status !== 200) return route.fulfill({ status, body: '' })
      signedIn = true
      // Real Set-Cookie headers, so the cookie round-trip is genuinely exercised.
      return json({ user }, 200, {
        'set-cookie': 'access=fake-access; Path=/; HttpOnly; SameSite=Lax',
      })
    }

    if (path === '/auth/logout' && method === 'POST') {
      signedIn = false
      return route.fulfill({
        status: 204,
        headers: { 'set-cookie': 'access=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' },
        body: '',
      })
    }

    if (path === '/auth/me') {
      return signedIn ? json({ user }) : route.fulfill({ status: 401, body: '' })
    }

    if (path === '/iot/mqtt-credentials') {
      return json({
        url: 'ws://localhost:9001/mqtt',
        clientId: 'e2e',
        username: 'u',
        password: 'p',
        expiresAt: Date.now() + 600_000,
      })
    }

    if (path === '/devices' && method === 'GET') return json(DEVICES)
    if (path === '/users' && method === 'GET') return json(Object.values(USERS))

    const detail = path.match(/^\/devices\/(.+)$/)
    if (detail) {
      const device = DEVICES.find((d) => d.id === detail[1])
      if (!device) return json({ message: 'not found' }, 404)
      if (method === 'PATCH') return json(device)
      return json(device)
    }

    return json({ message: `unstubbed ${method} ${path}` }, 500)
  })
}

export async function signIn(page: Page, role: Role = 'admin'): Promise<void> {
  await stubApi(page, { role })
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS[role].email)
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
}

/** Push a message through the in-memory MQTT transport. */
export async function emitMqtt(page: Page, topic: string, payload: unknown): Promise<void> {
  await page.evaluate(
    ([t, p]) => {
      const fake = (window as unknown as Record<string, { emit: (a: unknown, b: unknown) => void }>)
        .__mqttFake
      fake?.emit(t, p)
    },
    [topic, payload] as const,
  )
}
```

- [ ] **Step 4: Write the auth specs**

```ts
// e2e/auth.spec.ts
import { expect, test } from '@playwright/test'
import { signIn, stubApi } from './fixtures'

test('signs in and lands on the dashboard', async ({ page }) => {
  await signIn(page, 'admin')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Ada Admin')).toBeVisible()
})

test('shows a form-level error for bad credentials and stays on the form', async ({ page }) => {
  await stubApi(page, { loginStatus: 401 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByRole('alert')).toContainText(/incorrect/i)
  await expect(page).toHaveURL(/\/login/)
})

test('validates the email format client-side', async ({ page }) => {
  await stubApi(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill('nope')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/valid email/i)).toBeVisible()
})

test('deep link while logged out returns to the requested page after login', async ({ page }) => {
  await stubApi(page, { role: 'operator' })
  await page.goto('/devices/d1')
  await expect(page).toHaveURL(/\/login\?redirect=/)

  await page.getByLabel('Email').fill('op@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/devices\/d1/)
  await expect(page.getByRole('heading', { name: 'Boiler' })).toBeVisible()
})

test('signing out returns to login and Back does not restore the app', async ({ page }) => {
  await signIn(page, 'admin')
  await page.getByRole('button', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.goBack()
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 5: Write the RBAC specs**

```ts
// e2e/rbac.spec.ts
import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test('an admin sees every nav item', async ({ page }) => {
  await signIn(page, 'admin')
  await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
})

test('a viewer does not see the Users nav item', async ({ page }) => {
  await signIn(page, 'viewer')
  await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
})

test('a viewer navigating directly to /admin/users lands on forbidden with the shell', async ({
  page,
}) => {
  await signIn(page, 'viewer')
  await page.goto('/admin/users')

  await expect(page).toHaveURL(/\/forbidden/)
  await expect(page.getByRole('heading', { name: 'Not permitted' })).toBeVisible()
  // The sidebar must still be there — a 403 should not be a dead end.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('an operator can open device settings', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto('/devices/d1/settings')
  await expect(page.getByLabel('Name')).toBeVisible()
})

test('a viewer cannot open device settings', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.goto('/devices/d1/settings')
  await expect(page).toHaveURL(/\/forbidden/)
})

test('only an admin sees the delete control', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/devices')
  await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
})

test('an operator does not see the delete control', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto('/devices')
  await expect(page.getByRole('link', { name: 'Boiler' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
})
```

- [ ] **Step 6: Write the error-page specs**

```ts
// e2e/errors.spec.ts
import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test('an unknown URL renders the bare 404 page', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('a missing device renders the in-shell not-found state', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/devices/d999')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('an unreachable server shows the retry screen, not a logout', async ({ page }) => {
  // Fail only the bootstrap call, so the app cannot tell whether we are signed in.
  await page.route('**/api/auth/me', (route) => route.abort('failed'))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /cannot reach the server/i })).toBeVisible()
  await expect(page).not.toHaveURL(/\/login/)
})
```

That third test is the one that would have caught treating a BE outage as a mass logout.

- [ ] **Step 7: Write the telemetry spec**

```ts
// e2e/telemetry.spec.ts
import { expect, test } from '@playwright/test'
import { emitMqtt, signIn } from './fixtures'

test('a telemetry message updates the dashboard panel', async ({ page }) => {
  await signIn(page, 'viewer')
  await expect(page.getByText(/waiting for readings/i)).toBeVisible()

  await emitMqtt(page, 'devices/d1/telemetry', { deviceId: 'd1', ts: Date.now(), temp: 42 })

  await expect(page.getByText('42°C')).toBeVisible()
})

test('the connection badge reports online', async ({ page }) => {
  await signIn(page, 'viewer')
  await expect(page.getByText('online', { exact: true })).toBeVisible()
})

test('a status message marks a device online in the list', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/devices')
  await emitMqtt(page, 'devices/d1/status', { deviceId: 'd1', online: true, ts: Date.now() })
  await expect(page.getByText('online').first()).toBeVisible()
})
```

- [ ] **Step 8: Run the E2E suite**

```bash
npm run e2e
```

Expected: PASS (18 specs). If the telemetry specs fail because `window.__mqttFake` is undefined, confirm `VITE_MQTT_TRANSPORT=fake` reached the build — the flag is read at build time by Vite, so it must be in the `webServer.env` block, not set after the server starts.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "test: add Playwright end-to-end coverage for auth, RBAC and telemetry"
```

---

## Task 20: CI, local broker and documentation

**Files:**
- Create: `.github/workflows/ci.yml`, `docker-compose.yml`, `mosquitto/mosquitto.conf`, `README.md`
- Modify: `package.json` (`routes:check` script)

**Interfaces:**
- Consumes: every script defined so far
- Produces: a CI pipeline; `docker compose up` giving a WebSocket-enabled broker; a README documenting the BE contract

- [ ] **Step 1: Add the route-tree freshness script**

A stale committed `routeTree.gen.ts` would let a broken route tree merge while typecheck passes.

```bash
npm pkg set scripts.routes:generate="tsr generate"
npm pkg set scripts.routes:check="tsr generate && git diff --exit-code -- src/routeTree.gen.ts"
```

- [ ] **Step 2: Write the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      VITE_MQTT_URL: ws://localhost:9001/mqtt
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      # The generated route tree is committed, so a stale one must fail here
      # rather than silently typechecking against yesterday's routes.
      - name: Verify route tree is current
        run: npm run routes:check

      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:cov
      - run: npm run build

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - run: npm run e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Write the local broker setup**

```conf
# mosquitto/mosquitto.conf
listener 1883
protocol mqtt

# The browser can only speak MQTT over WebSocket, so this listener is the one
# the front end actually uses.
listener 9001
protocol websockets

allow_anonymous true
```

```yaml
# docker-compose.yml
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - '1883:1883'
      - '9001:9001'
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
```

`allow_anonymous true` is for local development only. Production requires per-topic ACLs keyed to the credential from `/iot/mqtt-credentials`.

- [ ] **Step 4: Write the README**

~~~markdown
# React Base

A Vite + React 19 base for internal IoT device-management front ends.

Design spec: `docs/superpowers/specs/2026-09-07-react-base-design.md`

## Getting started

```bash
npm ci
cp .env.example .env
docker compose up -d      # local MQTT broker with a WebSocket listener
npm run dev
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server, proxying `/api` to `VITE_PROXY_TARGET` |
| `npm test` | Unit and integration tests |
| `npm run test:cov` | Tests with coverage thresholds on `src/lib` |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run routes:check` | Fails if the committed route tree is stale |

## Permissions

The BE sends **roles**; the FE maps them to permissions in
`src/lib/rbac/permissions.ts`. To add a permission:

1. Add it to `PERMISSIONS`
2. Grant it to roles in `ROLE_PERMISSIONS`
3. Guard the route with `requirePermission(...)`, and gate any control with `<Can>`
4. Add the nav entry to `src/config/nav.ts` if it needs one

A role the FE does not recognise is ignored with a warning — a new BE role
degrades the UI rather than breaking it.

**The FE permission layer is UX, not authorization.** Route guards and `<Can>`
keep users out of dead ends. The BE endpoint and the broker's topic ACL are the
only real enforcement.

## Backend contract

| Method | Path | Response |
|---|---|---|
| POST | `/auth/login` | `200 { user }` + `Set-Cookie` (access, refresh) |
| POST | `/auth/refresh` | `200` + `Set-Cookie` / `401` |
| POST | `/auth/logout` | `204`, clears both cookies |
| GET | `/auth/me` | `200 { user }` / `401` |
| GET | `/iot/mqtt-credentials` | `200 { url, clientId, username, password, expiresAt }` |
| GET | `/devices` | `200 Device[]` |
| GET | `/devices/:id` | `200 Device` / `404` |
| PATCH | `/devices/:id` | `200 Device` |
| GET | `/users` | `200 User[]` |

Cookies must be `HttpOnly; Secure; SameSite=Lax; Path=/`. `HttpOnly` is the
point — without it there is no advantage over `localStorage`.

Going cross-domain additionally requires `SameSite=None; Secure`, credentialed
CORS with an explicit origin, and `VITE_ENABLE_CSRF=true`.

## Removing the demo

```bash
rm -rf src/modules/devices src/modules/users
rm src/routes/_auth.devices.* src/routes/_auth.admin.*
```

Then drop those entries from `src/config/nav.ts` and the demo permissions from
`src/lib/rbac/permissions.ts`. `src/lib` is the reusable core and stays.
~~~

- [ ] **Step 5: Verify everything end to end**

```bash
npm run routes:check
npm run lint
npm run typecheck
npm run test:cov
npm run build
npm run e2e
```

Expected: all pass; coverage thresholds on `src/lib/**` met.

If coverage falls below threshold, the gap is most likely `client.ts`'s reconnect handlers or `credentials.ts`'s error branches — add cases rather than lowering the numbers.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add CI pipeline, local broker and documentation"
```

---

## Appendix: Self-review record

Run after the plan was drafted, per the writing-plans checklist.

**Spec coverage.** Every spec section maps to at least one task:

| Spec § | Covered by |
|---|---|
| 4 Security boundary | Global Constraints; comments in `guards.ts`, `Can.tsx`, `useMqttSubscription.ts`; README |
| 5 Project structure | File Structure section; Task 1 (alias), Task 1 Step 7 (cross-feature import rule) |
| 6.1–6.3 RBAC | Tasks 3, 8, 9 |
| 7.1 Bootstrap (3 outcomes) | Task 7, Task 11 (`AppRoot`), Task 19 (`errors.spec.ts`) |
| 7.2 Store | Task 4 |
| 7.3 Refresh / 403 | Task 5 |
| 7.4 Logout + cache clear | Task 7, Task 11 Step 9 |
| 7.5 CSRF | Task 6 |
| 8.1 Route tree | Tasks 11, 17, 18 |
| 8.2 Execution order | Task 17 Step 5 (final test), Task 18 Step 5 (final test) |
| 8.3 Context + factories | Tasks 9, 11 |
| 8.4 Auth-change invalidation | Task 11 Step 9 |
| 8.5 Error / not-found tiers | Task 11 (all three tiers), Task 17 (`notFound()`), Task 19 |
| 8.6 Nav manifest | Task 12 |
| 8.7 Search params | Task 11 (`safeRedirect`) |
| 9 Login page | Task 13 |
| 10.1–10.5 MQTT | Tasks 14, 15 |
| 10.6 Batching | Task 16 |
| 11 State ownership | Tasks 4, 15, 16, 17 (`useDeviceEvents`) |
| 12.1 Unit tests | Every task |
| 12.2 E2E | Task 19 |
| 12.3 CI | Task 20 |
| 13 Tooling | Tasks 1, 20 |
| 14 BE contract | Task 20 (README), Task 19 (fixture) |
| 16 Demo slice | Tasks 17, 18 |

**Gaps found and closed during review:**

1. **`mqttStore` was named in the spec but had no owner.** Added `connectionStore.ts` in Task 15, surfaced as the header badge in Task 18.
2. **Spec §7.3 says a 403 resyncs permissions, but nothing wired `onForbidden` to `resyncSession`.** Added `resyncSession` to Task 7 and the wiring to Task 11 Step 9.
3. **`registerLogoutHandler` had no MQTT consumer.** Added `registerLogoutHandler(() => void disconnectMqtt())` in Task 15 Step 7.
4. **The redirect-bounce test in Task 13 depends on a route created in Task 17.** Marked `it.skip` in Task 13 and un-skipped explicitly in Task 17 Step 7, rather than leaving a failing test between tasks.
5. **`Link to={item.to}` from a `string`-typed manifest cannot typecheck before the routes exist.** Called out in Task 12 Step 9 with a narrow, removable cast, and its removal is Task 17 Step 8.

**Type consistency.** Names verified identical across tasks: `resolvePermissions`, `can`/`canAll`/`canAny`, `authStore`/`useAuthStore`, `setSession`/`setUnauthenticated`/`setBootstrapError`, `apiFetch`/`HttpError`/`setHttpHooks`, `csrfHeaders`, `bootstrap`/`login`/`logout`/`resyncSession`/`registerLogoutHandler`, `safeRedirect`, `requireAuth`/`requirePermission`/`requireAnyPermission`, `GuardArgs`/`RouterAuthSnapshot`, `RouterContext` (`getAuth`, `queryClient`), `MqttLike`/`setConnectFactory`/`makeClientId`/`connectMqtt`/`disconnectMqtt`/`subscribeTopic`/`publishTopic`/`startMqttLifecycle`, `TOPICS`/`parsePayload`/`matchTopic`/`droppedCount`, `ensureCredentials`/`getCachedCredentials`/`clearCredentials`, `RingBuffer`/`createBatcher`, `telemetryStore`/`pushTelemetry`/`pushTelemetryBatch`/`setOnline`/`resetTelemetry`/`SERIES_CAPACITY`, `useMqttSubscription`, `deviceKeys`/`devicesQueryOptions`/`deviceQueryOptions`, `installFetchMock`/`mockRoute`/`mockNetworkError`/`callCount`/`lastInit`/`resetFetchMock`, `FakeMqttClient`/`fakeConnectFactory`/`lastFakeClient`/`resetFakeClients`, `renderRoute`/`signIn`/`makeTestQueryClient`.

One deliberate name collision: `signIn` exists in both `src/test/router.tsx` (sets the store) and `e2e/fixtures.ts` (drives the real form). They are never imported into the same file.

