/**
 * The single choke point for token persistence. Everything else in the app
 * goes through these four functions rather than touching storage directly,
 * so swapping the storage strategy later (e.g. memory-only access tokens) is
 * a one-file change.
 *
 * Deliberate trade-off: `localStorage` is readable by any script that can
 * run in this origin, so a successful XSS can exfiltrate both tokens. That
 * is the cost Bearer-token auth accepts in exchange for the frontend being
 * able to read its own identity and attach the header itself — the whole
 * point of this migration away from HttpOnly cookies. A project that wants
 * memory-only access tokens (traded against "a page refresh logs you out"
 * or a silent-refresh-on-load dance) changes only this file.
 */

const ACCESS_KEY = 'auth.accessToken'
const REFRESH_KEY = 'auth.refreshToken'

export type Tokens = {
  accessToken: string
  refreshToken: string
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // A private window, blocked site data, or a disabled storage API throws
    // rather than returning null. Degrade to "no token", never crash.
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignored on purpose — see module comment.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignored on purpose — see module comment.
  }
}

export function getAccessToken(): string | null {
  return safeGet(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return safeGet(REFRESH_KEY)
}

export function setTokens(tokens: Tokens): void {
  safeSet(ACCESS_KEY, tokens.accessToken)
  safeSet(REFRESH_KEY, tokens.refreshToken)
}

export function clearTokens(): void {
  safeRemove(ACCESS_KEY)
  safeRemove(REFRESH_KEY)
}
