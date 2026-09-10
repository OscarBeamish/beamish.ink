import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tools/tests/**/*.test.ts'],
    // A real browser has to launch, and the first run pays for a cold GPU
    // process. This is not a unit-test timeout.
    testTimeout: 180_000,
    hookTimeout: 120_000,
    // One browser, one item at a time. Running effects in parallel would put
    // several WebGL contexts in flight at once, which is the very thing the test
    // is trying to measure.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
})
