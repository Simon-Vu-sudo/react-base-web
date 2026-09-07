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
