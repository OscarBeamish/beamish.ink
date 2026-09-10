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
