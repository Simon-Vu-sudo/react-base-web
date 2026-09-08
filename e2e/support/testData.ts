/**
 * Shared fixture data mirroring the fake backend's seeds
 * (`src/dev/fakeApi.ts`). Not a step file — plain data, imported by files
 * under `e2e/steps/`.
 */

/** All seeded accounts share this password. */
export const PASSWORD = 'password'

/** Role name (as used in feature files) -> seeded account email. */
export const ROLE_EMAILS: Record<string, string> = {
  admin: 'admin@example.com',
  operator: 'operator@example.com',
  viewer: 'viewer@example.com',
}

export function emailForRole(role: string): string {
  const email = ROLE_EMAILS[role]
  if (!email) throw new Error(`Unknown role "${role}". Known roles: ${Object.keys(ROLE_EMAILS).join(', ')}`)
  return email
}

/** Seeded device name -> id, per `src/dev/fakeApi.ts`. */
const DEVICE_IDS: Record<string, string> = {
  'Line Sensor 1': 'd1',
  'Line Sensor 2': 'd2',
  Gateway: 'd3',
}

export function idForDevice(name: string): string {
  const id = DEVICE_IDS[name]
  if (!id) throw new Error(`Unknown seeded device "${name}". Known devices: ${Object.keys(DEVICE_IDS).join(', ')}`)
  return id
}
