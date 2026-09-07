/** Fixed-capacity buffer, so a charted series cannot grow until the tab dies. */
export class RingBuffer<T> {
  private items: T[] = []

  constructor(readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item)
    if (this.items.length > this.capacity) this.items.shift()
  }

  toArray(): T[] {
    return [...this.items]
  }

  get size(): number {
    return this.items.length
  }
}

export type Batcher<T> = {
  push: (key: string, value: T) => void
  flushNow: () => void
  dispose: () => void
}

/**
 * Turns an unbounded message rate into a bounded commit rate. Messages land in
 * a plain Map outside React; one frame later the whole batch is committed once.
 * 50 devices at 10Hz becomes ~60 commits/sec instead of 500.
 *
 * `schedule`/`cancel` are injectable so tests can drive frames deterministically.
 */
export function createBatcher<T>(
  flush: (batch: Map<string, T>) => void,
  schedule: (cb: () => void) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): Batcher<T> {
  let buffer = new Map<string, T>()
  let frame: number | null = null
  let disposed = false

  const run = () => {
    frame = null
    if (buffer.size === 0) return
    const batch = buffer
    buffer = new Map<string, T>()
    flush(batch)
  }

  return {
    push(key, value) {
      if (disposed) return
      buffer.set(key, value)
      if (frame === null) frame = schedule(run)
    },
    flushNow() {
      if (frame !== null) {
        cancel(frame)
        frame = null
      }
      run()
    },
    dispose() {
      disposed = true
      if (frame !== null) cancel(frame)
      frame = null
      buffer = new Map<string, T>()
    },
  }
}
