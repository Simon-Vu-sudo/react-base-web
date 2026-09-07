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
