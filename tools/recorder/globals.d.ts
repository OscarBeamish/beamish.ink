/** Injected by the recorder's clock stub and scrubber, and by each demo.html. */
declare global {
  interface Window {
    /** Freezes performance.now/Date.now at a given millisecond. */
    __setClock?: (ms: number) => void
    /** Pauses every CSS transition and scrubs it to a given time in seconds. */
    __beamishScrub?: (seconds: number) => void
    /** Tier 1: the effect handle demo.html mounted. */
    __beamish: {
      renderAtTime(t: number): void
      update(opts: Record<string, unknown>): void
      start(): void
      stop(): void
      destroy(): void
    }
    /** What `pnpm build:items` puts on the page. */
    Beamish: {
      tier: 1 | 2
      create(el: HTMLElement, opts?: Record<string, unknown>): Window['__beamish']
      mount(el: HTMLElement, props?: Record<string, unknown>): { unmount(): void }
    }
  }
}

export {}
