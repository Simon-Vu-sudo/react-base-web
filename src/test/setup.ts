import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// jsdom does not implement scrollTo; TanStack Router's scroll restoration
// calls it on every navigation, which otherwise logs a "Not implemented"
// warning on every routing test.
window.scrollTo = () => {}

// The full suite runs many jsdom environments in parallel; under that CPU
// contention, router-driven async renders can occasionally exceed
// testing-library's 1000ms default wait, producing flaky (not incorrect)
// failures. A longer ceiling does not change what is asserted.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
