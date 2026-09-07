#!/usr/bin/env node
/**
 * Dependency-free mock API for manually exercising Bearer-JWT auth and
 * role-based permissions against the real frontend. No jsonwebtoken, no
 * express — just node:http and node:crypto, so `node mock-api/server.mjs`
 * runs with nothing to install.
 *
 * Three seeded accounts, all with password "password":
 *   admin@example.com     roles: ['admin']
 *   operator@example.com  roles: ['operator']
 *   viewer@example.com    roles: ['viewer']
 *
 * Env:
 *   PORT                 default 8080
 *   ACCESS_TTL_SECONDS   default 900 (15 min). Set to 30 to make the
 *                        frontend's refresh interceptor fire during manual
 *                        testing — that is the point of exposing this knob.
 *   JWT_SECRET           default a fixed dev-only string. This is a mock
 *                        for local/manual testing only; never point a real
 *                        deployment at it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT) || 8080
const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TTL_SECONDS) || 900
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TTL_SECONDS) || 60 * 60 * 24 * 7
const JWT_SECRET = process.env.JWT_SECRET || 'mock-api-dev-only-secret-do-not-use-in-prod'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

// --- Seed data -------------------------------------------------------------
// Roles and their permissions mirror src/lib/rbac/permissions.ts exactly:
//   admin:    everything (device.view/write/delete, user.view/manage)
//   operator: device.view, device.write, user.view — no user.manage, no delete
//   viewer:   device.view only

const USERS = [
  {
    id: 'u-admin',
    email: 'admin@example.com',
    name: 'Ada Admin',
    roles: ['admin'],
    password: 'password',
  },
  {
    id: 'u-operator',
    email: 'operator@example.com',
    name: 'Otto Operator',
    roles: ['operator'],
    password: 'password',
  },
  {
    id: 'u-viewer',
    email: 'viewer@example.com',
    name: 'Vera Viewer',
    roles: ['viewer'],
    password: 'password',
  },
]

let devices = [
  { id: '1', name: 'Boiler A', location: 'Plant 1 — Boiler Room', firmware: '1.2.0' },
  { id: '2', name: 'Chiller B', location: 'Plant 1 — Roof', firmware: '2.0.1' },
  { id: '3', name: 'Pump C', location: 'Plant 2 — Basement', firmware: '1.0.4' },
]

// --- Hand-rolled HS256 JWT (~15 lines: header + payload + HMAC signature) --

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuffer(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64')
}

function sign(payload) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64url(Buffer.from(JSON.stringify(payload)))
  const signature = base64url(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest())
  return `${header}.${body}.${signature}`
}

/** Verifies signature + expiry. Returns the payload, or null if invalid/expired. */
function verify(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = base64url(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest())
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(base64urlToBuffer(body).toString('utf8'))
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function issueTokens(user) {
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub: user.id, email: user.email, name: user.name, roles: user.roles, iat: now }
  return {
    accessToken: sign({ ...claims, exp: now + ACCESS_TTL_SECONDS, type: 'access' }),
    refreshToken: sign({ ...claims, exp: now + REFRESH_TTL_SECONDS, type: 'refresh' }),
  }
}

// --- Tiny HTTP helpers -------------------------------------------------------

function cors(res) {
  res.setHeader('access-control-allow-origin', ALLOWED_ORIGIN)
  res.setHeader('vary', 'Origin')
}

function sendJson(res, status, body) {
  cors(res)
  if (body === undefined) {
    res.writeHead(status)
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/** Returns the verified access-token claims for this request, or null. */
function authenticate(req) {
  const header = req.headers.authorization || ''
  const match = /^Bearer (.+)$/.exec(header)
  if (!match) return null
  const claims = verify(match[1])
  if (!claims || claims.type !== 'access') return null
  return claims
}

const hasAnyRole = (claims, ...roles) => roles.some((r) => claims.roles.includes(r))

// --- Server ------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  const method = req.method || 'GET'

  if (method === 'OPTIONS') {
    cors(res)
    res.writeHead(204, {
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
      'access-control-max-age': '600',
    })
    res.end()
    return
  }

  try {
    if (method === 'POST' && path === '/auth/login') {
      const body = await readJsonBody(req)
      const user = USERS.find((u) => u.email === body.email && u.password === body.password)
      if (!user) return sendJson(res, 401, { message: 'That email or password is incorrect.' })
      return sendJson(res, 200, issueTokens(user))
    }

    if (method === 'POST' && path === '/auth/refresh') {
      const body = await readJsonBody(req)
      const claims = verify(body.refreshToken)
      if (!claims || claims.type !== 'refresh') {
        return sendJson(res, 401, { message: 'Invalid or expired refresh token.' })
      }
      const user = USERS.find((u) => u.id === claims.sub)
      if (!user) return sendJson(res, 401, { message: 'Unknown user.' })
      return sendJson(res, 200, issueTokens(user))
    }

    if (method === 'POST' && path === '/auth/logout') {
      // Bearer auth is stateless server-side — nothing to revoke in this
      // mock. A real BE would blacklist the refresh token here.
      return sendJson(res, 204, undefined)
    }

    // Every route below requires a valid access token.
    const claims = authenticate(req)
    if (!claims) return sendJson(res, 401, { message: 'Missing or invalid access token.' })

    if (method === 'GET' && path === '/devices') {
      return sendJson(res, 200, devices)
    }

    const deviceMatch = /^\/devices\/([^/]+)$/.exec(path)
    if (deviceMatch) {
      const id = deviceMatch[1]

      if (method === 'GET') {
        const device = devices.find((d) => d.id === id)
        if (!device) return sendJson(res, 404, { message: 'Device not found.' })
        return sendJson(res, 200, device)
      }

      if (method === 'PATCH') {
        if (!hasAnyRole(claims, 'admin', 'operator')) {
          return sendJson(res, 403, { message: 'You do not have permission to edit devices.' })
        }
        const device = devices.find((d) => d.id === id)
        if (!device) return sendJson(res, 404, { message: 'Device not found.' })
        const patch = await readJsonBody(req)
        Object.assign(device, patch, { id: device.id })
        return sendJson(res, 200, device)
      }

      if (method === 'DELETE') {
        if (!hasAnyRole(claims, 'admin')) {
          return sendJson(res, 403, { message: 'You do not have permission to delete devices.' })
        }
        const before = devices.length
        devices = devices.filter((d) => d.id !== id)
        if (devices.length === before) return sendJson(res, 404, { message: 'Device not found.' })
        return sendJson(res, 204, undefined)
      }
    }

    if (method === 'GET' && path === '/users') {
      if (!hasAnyRole(claims, 'admin')) {
        return sendJson(res, 403, { message: 'You do not have permission to view users.' })
      }
      return sendJson(
        res,
        200,
        USERS.map(({ password: _password, ...safe }) => safe),
      )
    }

    return sendJson(res, 404, { message: 'Not found.' })
  } catch (err) {
    console.error('[mock-api] unhandled error', err)
    return sendJson(res, 500, { message: 'Internal server error.' })
  }
})

server.listen(PORT, () => {
  console.log(`mock-api listening on http://localhost:${PORT}`)
  console.log(`access token TTL: ${ACCESS_TTL_SECONDS}s`)
  console.log('accounts (password "password" for all):')
  for (const u of USERS) console.log(`  ${u.email}  ->  ${u.roles.join(', ')}`)
})
