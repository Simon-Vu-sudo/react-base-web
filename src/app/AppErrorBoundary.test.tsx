import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'

function ThrowsFalsy(): never {
  throw null
}

describe('<AppErrorBoundary>', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the fallback when the thrown value is falsy', () => {
    render(
      <AppErrorBoundary>
        <ThrowsFalsy />
      </AppErrorBoundary>,
    )
    expect(screen.getByText('The application failed to start')).toBeInTheDocument()
  })
})
