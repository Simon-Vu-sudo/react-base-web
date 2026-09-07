import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFetchMock, mockRoute, resetFetchMock, callCount } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { clearTokens } from '@/lib/auth/tokenStore'
import { LoginForm } from './LoginForm'

/** Base64url-encodes a JSON payload the way a real JWT segment would be. */
function encodeSegment(value: unknown): string {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeJwt(claims: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(claims)}.sig`
}

const accessToken = makeJwt({
  sub: 'u1',
  email: 'a@b.co',
  name: 'Ann',
  roles: ['viewer'],
  exp: Math.floor(Date.now() / 1000) + 3600,
})

beforeEach(() => {
  installFetchMock()
  authStore.getState().setUnauthenticated()
  clearTokens()
})
afterEach(() => {
  resetFetchMock()
  clearTokens()
})

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
    // /auth/login returns the token pair; identity is decoded from the access token.
    mockRoute('POST', '/api/auth/login', { body: { accessToken, refreshToken: 'r1' } })
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

  // Rewritten per dispatch override: the brief's gate/release version raced because its
  // responder never awaited the gate. This instead asserts the actual requirement from
  // spec §9 directly — a double-submit must not fire two logins — rather than the
  // disabled-attribute mechanism, which is less timing-dependent.
  it('does not fire a second login when submit is double-clicked', async () => {
    mockRoute('POST', '/api/auth/login', { body: { accessToken, refreshToken: 'r1' } })
    render(<LoginForm onSuccess={vi.fn()} />)
    await fill('a@b.co', 'pw')
    const btn = screen.getByRole('button', { name: /sign in/i })
    // Two clicks fired back-to-back, synchronously, before either submission
    // settles — the scenario a real double-click produces. userEvent.click
    // manages pointer state per-session and two concurrent sessions on the
    // same element deadlock, so plain fireEvent is used here instead.
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(callCount('POST', '/api/auth/login')).toBe(1))
  })

  it('has the autocomplete attributes password managers need', () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})
