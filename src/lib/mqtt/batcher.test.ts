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
