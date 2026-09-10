/** Injected by the recorder's clock stub, and by each item's demo.html. */
declare global {
  interface Window {
    __setClock?: (ms: number) => void
    __beamish: {
      renderAtTime(t: number): void
      update(opts: Record<string, unknown>): void
      start(): void
      stop(): void
      destroy(): void
    }
  }
}

export {}
