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
