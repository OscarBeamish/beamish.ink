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
  /*
   * Prefetch on sight rather than on hover.
   *
   * ClientRouter turns prefetching on by default, but the default strategy is
   * 'hover': the fetch starts when the pointer arrives, so a reader who tabs
   * to a nav link, or taps one, waits for the round trip they were meant to
   * have been spared. The nav is in view on every page, so 'viewport' has it
   * in the cache before anyone reaches for it.
   *
   * What this is worth, measured on the built site with `pnpm navcheck`:
   *
   *   on localhost            nothing. 45ms hovered, 47ms cold, either
   *                           strategy. The next page's HTML arrives in about
   *                           a millisecond, so early and late are the same.
   *   at 150ms RTT            a prefetched swap lands in about 200ms and one
   *                           that was not in about a second.
   *
   * So the setting buys the difference between those two for a reader who
   * never hovers, and nothing at all for anybody testing it locally. That is
   * also why the numbers that were written here before are gone: they were
   * taken against a dev server wearing the preview port, by a tool that lost a
   * race whenever a swap was fast, which is to say they were measuring the
   * wrong thing twice.
   *
   * The cost is the prefetching itself. Astro caps it: a wall of 67 links
   * prefetched 11 of them, not 67.
   */
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  /*
   * PointerTrail became PointerSmoke. Prompts already pasted are unaffected,
   * because each one fetches from the tag it was generated against, but a link
   * to the old page should still land somewhere.
   */
  redirects: {
    '/effects/pointer-trail': '/effects/pointer-smoke'
  },
  vite: {
    plugins: [tailwind()],
    /*
     * React's dev JSX runtime, prebundled explicitly.
     *
     * Without this the four tier-2 pages threw "jsxDEV is not a function" on
     * the dev server and nothing else: the build was clean, the islands
     * mounted correctly in a preview, and only `pnpm sweep`, which crawls dev,
     * could see it. It is the usual shape of a Vite dep-optimisation problem.
     * The react plugin pulls jsx-dev-runtime in through a transform rather
     * than through an import Vite can see while it scans, so when an
     * unrelated change makes it re-optimise, the runtime can come back as a
     * chunk that does not export what the compiled pages are calling.
     *
     * Naming them makes them part of the first optimise rather than a
     * discovery part way through.
     */
    optimizeDeps: {
      /*
       * three is here for the same reason and with a sharper symptom. Item
       * cores are imported through @fs/ paths outside the site, which Vite's
       * dependency scanner does not crawl, so three is always discovered late:
       * the first page that wants it triggers a re-optimise, every module
       * holding the previous hash gets a 504 Outdated Optimize Dep, and what
       * that looks like is a demo panel that mounts nothing on exactly the
       * three.js items. Naming it makes it part of the first pass.
       *
       * Caught by counting canvases rather than by looking: ChromeForm and
       * DepthPointCloud rendered an empty panel and said nothing, which is the
       * failure AGENTS.md describes and the method it prescribes for finding
       * it.
       */
      include: ['three']
    },
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
