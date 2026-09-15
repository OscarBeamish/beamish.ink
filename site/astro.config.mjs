import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

// https://astro.build/config
export default defineConfig({
  site: 'https://beamish.ink',
  integrations: [react()],
  /*
   * A port of its own. Astro's default 4321 collides with every other Astro
   * project on this machine, and its auto-increment means you never know which
   * one you are looking at.
   *
   * Dev only. `preview` is deliberately left unset: pnpm review starts its own
   * preview with an explicit --port, and a configured port here would let it
   * auto-increment onto the one the review is waiting for.
   */
  server: { port: 4488 },
  vite: {
    plugins: [tailwind()],
    resolve: {
      alias: {
        // The site imports the real item sources rather than a copy, so what is
        // demonstrated is exactly what a prompt hands out.
        '@items': repo,
        '@shared': path.join(repo, 'shared')
      }
    },
    server: {
      fs: {
        // effects/, components/ and shared/ all live above the site root.
        allow: [repo]
      }
    }
  }
})
