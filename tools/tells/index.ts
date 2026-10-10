/*
 * pnpm tells <route> [...]
 *
 * What on a page gives away that an AI made it.
 *
 * This exists because the nineteen templates in this repo read as AI-made and
 * nobody could say why. Measured, the answer was the opposite of the guess.
 * The set already avoids the obvious signals: four of nineteen centre a hero,
 * none uses an emoji as an icon, the words "Get Started" and "Seamless" appear
 * zero times, and most of them use a real display face rather than Inter.
 *
 * What it is full of is the second order of the problem, the moves that became
 * tells by being the fashionable fix for the first order: tracked all-caps
 * mono labels on seventeen of nineteen pages, decorative 01 / 02 / 03 on
 * fourteen, one accented word in the headline on twelve, gradient-clipped
 * headline text on ten. Those are not mistakes anybody makes by accident. They
 * are what a model reaches for when it is asked to make something look
 * designed.
 *
 * EARNED, OR CHROME
 *
 * None of these is wrong in itself, which is the whole difficulty, and it is
 * why this reports rather than fails. A machine front panel really is
 * stencilled in tracked uppercase; a terminal really is monospace; a frame of
 * film really is numbered. The same devices on a SaaS page with no claim on
 * them are decoration borrowed from somewhere with better reasons.
 *
 * So a page may declare an exception in its own markup, with
 * `data-earned="why"`, and the reason is the point: writing one makes you say
 * out loud what gives the page the right to the device. Those are listed
 * separately rather than counted, so the argument stays visible instead of
 * being settled by a flag nobody reads.
 *
 * WHAT IT CANNOT SEE
 *
 * Whether the thing is any good. It counts devices, and a page can clear every
 * count here and still be dull, or carry three of them and be excellent
 * because it meant them. Read the report, then look at the page.
 */

import { chromium, type Browser, type Page } from 'playwright'
import { ensureServer, routeFrom, ORIGIN } from '../dev-server'

/** One kind of tell, with what the page actually did. */
type Finding = {
  key: string
  what: string
  count: number
  /** A few examples, so a count can be chased back to the page. */
  samples: string[]
  /** Uses that the page claims, with the reason it gave. */
  earned: string[]
  /**
   * The hits grouped by the element that carries them, worst first. A count of
   * eighty says nothing you can act on; eighty split into six rules, each with
   * its text, is a list of six decisions. Only the two rules that need
   * triaging fill this in.
   */
  where?: string[]
}

/** Faces a model reaches for when it has not been told what to use. */
const DEFAULT_FACES =
  /^(Inter|Inter Tight|Space Grotesk|Geist|Geist Mono|Instrument Serif|Instrument Sans|Fraunces|Manrope|Plus Jakarta Sans|Poppins|Montserrat)$/i

/** The indigo-to-violet band the whole genre lives in. */
const PURPLE_FROM = 245
const PURPLE_TO = 290

/*
 * Everything in here runs in the browser, where the transpiler's keep-names
 * helper does not exist: a named function inside this body throws
 * `__name is not defined` on its first call. One body, nothing named.
 */
async function collect(page: Page): Promise<Finding[]> {
  return page.evaluate(
    ([faceSource, purpleFrom, purpleTo]) => {
      const DEFAULTS = new RegExp(faceSource as string, 'i')
      const found: Finding[] = []
      const all = [...document.querySelectorAll<HTMLElement>('body *')]

      // The reason a page gives for a device, from the nearest ancestor that
      // claims one. Empty string when nothing claims it.
      const claims: string[] = []
      const claimed: boolean[] = []
      for (const el of all) {
        const node = el.closest('[data-earned]')
        claimed.push(node !== null)
        claims.push(node ? node.getAttribute('data-earned') || 'no reason given' : '')
      }

      const text = document.body.innerText

      // Where each hit sits, keyed by tag and class, with a little of its text.
      // Written to by the two rules that need a judgement per use; read back at
      // the end of each.
      const groups: Record<string, Record<string, { n: number; texts: string[] }>> = {}

      // --- tracked all-caps mono labels ---------------------------------
      let capsN = 0
      const capsSamples: string[] = []
      const capsEarned: string[] = []
      for (let i = 0; i < all.length; i++) {
        const el = all[i]!
        const cs = getComputedStyle(el)
        if (cs.textTransform !== 'uppercase') continue
        if (!/mono/i.test(cs.fontFamily)) continue
        if (parseFloat(cs.letterSpacing) <= 0.5) continue
        if (el.children.length > 0) continue
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
        // Two characters at least, and not inside a heading. A page that
        // animates its headline one letter at a time wraps every character in
        // its own span, and those inherit the heading's case: thirteen of them
        // counted as labels on the first run, which is a typing effect being
        // reported as a design decision.
        if (t.length < 2) continue
        if (el.closest('h1, h2, h3')) continue
        if (claimed[i]) {
          if (capsEarned.length < 3) capsEarned.push(`"${t}" — ${claims[i]}`)
          continue
        }
        capsN++
        if (capsSamples.length < 4) capsSamples.push(`"${t}"`)
        // className is an SVGAnimatedString on an SVG node, which stringifies
        // to [object SVGAnimatedString]; the attribute is the same on both.
        const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)
        const key = el.tagName.toLowerCase() + (cls.length > 0 ? '.' + cls.join('.') : '')
        if (!groups.caps) groups.caps = {}
        if (!groups.caps[key]) groups.caps[key] = { n: 0, texts: [] }
        groups.caps[key]!.n++
        if (groups.caps[key]!.texts.length < 3) groups.caps[key]!.texts.push(t)
      }
      found.push({
        key: 'caps-mono',
        what: 'tracked all-caps mono labels',
        count: capsN,
        samples: capsSamples,
        earned: capsEarned,
        where: Object.entries(groups.caps || {})
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 8)
          .map(e => `${String(e[1].n).padStart(4)}  ${e[0]}  ${e[1].texts.map(x => `"${x}"`).join(' ')}`)
      })

      // --- decorative 01 / 02 / 03 ---------------------------------------
      let numN = 0
      const numSamples: string[] = []
      const numEarned: string[] = []
      for (let i = 0; i < all.length; i++) {
        const el = all[i]!
        if (el.children.length > 0) continue
        const t = (el.textContent || '').trim()
        if (!/^0[1-9]$/.test(t)) continue
        if (claimed[i]) {
          if (numEarned.length < 3) numEarned.push(`"${t}" — ${claims[i]}`)
          continue
        }
        numN++
        if (numSamples.length < 4) {
          numSamples.push(`"${t}" in .${(el.parentElement?.getAttribute('class') || '').slice(0, 18)}`)
        }
        const ncls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)
        const nkey =
          el.tagName.toLowerCase() +
          (ncls.length > 0 ? '.' + ncls.join('.') : '') +
          ` in .${(el.parentElement?.getAttribute('class') || '?').split(/\s+/)[0]}`
        if (!groups.num) groups.num = {}
        if (!groups.num[nkey]) groups.num[nkey] = { n: 0, texts: [] }
        groups.num[nkey]!.n++
        if (groups.num[nkey]!.texts.length < 3) groups.num[nkey]!.texts.push(t)
      }
      found.push({
        key: 'numbering',
        what: 'decorative 01 / 02 / 03',
        count: numN,
        samples: numSamples,
        earned: numEarned,
        where: Object.entries(groups.num || {})
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 8)
          .map(e => `${String(e[1].n).padStart(4)}  ${e[0]}  ${e[1].texts.map(x => `"${x}"`).join(' ')}`)
      })

      // --- one accented word in the headline ------------------------------
      const heads = [...document.querySelectorAll<HTMLElement>('h1, h2')]
      let accN = 0
      const accSamples: string[] = []
      for (const h of heads) {
        if (h.closest('[data-earned]')) continue
        const base = getComputedStyle(h).color
        for (const span of h.querySelectorAll<HTMLElement>('span, em, b, strong, i')) {
          if (span.children.length > 0) continue
          const t = (span.textContent || '').trim()
          // Two characters at least, for the same reason the caps rule has that
          // floor: a headline typed on one letter at a time wraps every
          // character in its own span, and one of those being a different
          // colour mid-type is a typing effect rather than an accented word.
          if (!t || t.length < 2 || t.length > 24) continue
          if (getComputedStyle(span).color === base) continue
          accN++
          if (accSamples.length < 4) accSamples.push(`"${t}"`)
          break
        }
      }
      found.push({
        key: 'accent-word',
        what: 'one accented word in a heading',
        count: accN,
        samples: accSamples,
        earned: []
      })

      // --- gradient-clipped headline text ---------------------------------
      let clipN = 0
      const clipSamples: string[] = []
      const clipEarned: string[] = []
      for (let i = 0; i < all.length; i++) {
        const el = all[i]!
        const cs = getComputedStyle(el)
        const clipped =
          (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') &&
          cs.backgroundImage.includes('gradient')
        if (!clipped) continue
        /*
         * Count the decision, not the characters.
         *
         * A headline animated one letter at a time wraps every character in its
         * own span, and each of those inherits the clip from the heading above
         * it. One page measured 438 here, which is one headline: the gradient
         * was applied once and counted once per letter. An element whose parent
         * is clipped the same way is part of the same decision, so only the
         * outermost one is a finding.
         */
        const parent = el.parentElement
        if (parent) {
          const ps = getComputedStyle(parent)
          const parentClipped =
            (ps.webkitBackgroundClip === 'text' || ps.backgroundClip === 'text') &&
            ps.backgroundImage.includes('gradient')
          if (parentClipped) continue
          /*
           * The letters may carry the clip themselves rather than inherit it,
           * in which case no ancestor is clipped and the check above sees
           * nothing. Three or more clipped children of one parent is a line
           * that was split, not three decisions: it is counted once, against
           * the parent, by letting only the first through.
           */
          let siblings = 0
          for (const kid of parent.children) {
            const ks = getComputedStyle(kid as HTMLElement)
            if (
              (ks.webkitBackgroundClip === 'text' || ks.backgroundClip === 'text') &&
              ks.backgroundImage.includes('gradient')
            ) {
              siblings++
            }
          }
          if (siblings >= 3 && el !== parent.firstElementChild) continue
        }
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26)
        // One letter is not a design decision. Same floor as the caps and
        // accent rules, and for the same reason: a headline animated character
        // by character wraps each one separately, sometimes twice.
        if (t.length < 2) continue
        if (claimed[i]) {
          if (clipEarned.length < 3) clipEarned.push(`"${t}" — ${claims[i]}`)
          continue
        }
        clipN++
        if (clipSamples.length < 3) clipSamples.push(`"${t}"`)
      }
      found.push({
        key: 'gradient-text',
        what: 'gradient-clipped text',
        count: clipN,
        samples: clipSamples,
        earned: clipEarned
      })

      // --- the indigo band -------------------------------------------------
      let purpleN = 0
      const purpleSamples: string[] = []
      const purpleEarned: string[] = []
      for (let i = 0; i < all.length; i++) {
        const el = all[i]!
        const cs = getComputedStyle(el)
        let hit = ''
        for (const value of [cs.color, cs.backgroundColor, cs.backgroundImage, cs.borderTopColor]) {
          for (const m of String(value).matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
            const r = Number(m[1]) / 255
            const g = Number(m[2]) / 255
            const b = Number(m[3]) / 255
            const mx = Math.max(r, g, b)
            const mn = Math.min(r, g, b)
            const d = mx - mn
            if (d < 0.12 || mx < 0.12) continue
            let h = 0
            if (mx === r) h = ((g - b) / d) % 6
            else if (mx === g) h = (b - r) / d + 2
            else h = (r - g) / d + 4
            h = (Math.round(h * 60) + 360) % 360
            if (h >= (purpleFrom as number) && h <= (purpleTo as number)) {
              hit = `rgb(${m[1]},${m[2]},${m[3]}) h${h}`
            }
          }
        }
        if (!hit) continue
        if (claimed[i]) {
          if (purpleEarned.length < 2) purpleEarned.push(`${hit} — ${claims[i]}`)
          continue
        }
        purpleN++
        if (purpleSamples.length < 3) purpleSamples.push(hit)
      }
      found.push({
        key: 'indigo',
        what: 'colours in the indigo-to-violet band',
        count: purpleN,
        samples: purpleSamples,
        earned: purpleEarned
      })

      // --- glass -----------------------------------------------------------
      let glassN = 0
      for (let i = 0; i < all.length; i++) {
        if (claimed[i]) continue
        if (getComputedStyle(all[i]!).backdropFilter !== 'none') glassN++
      }
      found.push({
        key: 'glass',
        what: 'backdrop-filter surfaces',
        count: glassN,
        samples: [],
        earned: []
      })

      // --- the undecided typeface -------------------------------------------
      const faces = new Map<string, number>()
      for (const el of all) {
        const f = getComputedStyle(el).fontFamily.split(',')[0]!.replace(/["']/g, '').trim()
        faces.set(f, (faces.get(f) || 0) + 1)
      }
      const ranked = [...faces.entries()].sort((a, b) => b[1] - a[1])
      const primary = ranked[0]?.[0] || ''
      found.push({
        key: 'default-face',
        what: 'an undecided typeface as the primary face',
        count: DEFAULTS.test(primary) ? 1 : 0,
        samples: DEFAULTS.test(primary) ? [primary] : [],
        earned: []
      })

      // --- the stock shapes --------------------------------------------------
      let threeUp = 0
      for (const el of all) {
        const cs = getComputedStyle(el)
        if (!cs.display.includes('grid')) continue
        const cols = cs.gridTemplateColumns.split(' ').filter(Boolean)
        if (cols.length === 3 && new Set(cols).size === 1 && el.children.length === 3) threeUp++
      }
      found.push({
        key: 'three-up',
        what: 'rows of exactly three equal cards',
        count: threeUp,
        samples: [],
        earned: []
      })

      let dots = 0
      const dotsEarned: string[] = []
      for (let i = 0; i < all.length; i++) {
        const el = all[i]!
        if (el.children.length !== 3) continue
        let ok = true
        for (const kid of el.children) {
          const c = getComputedStyle(kid as HTMLElement)
          const r = (kid as HTMLElement).getBoundingClientRect()
          if (!c.borderRadius.includes('50%') || r.width < 5 || r.width > 16) ok = false
          if (Math.abs(r.width - r.height) > 2) ok = false
        }
        if (!ok) continue
        /*
         * Three small circles in a row are a macOS title bar on a page that has
         * no window, and they are also a chat's typing indicator, which has
         * been three dots since 2008. This rule could not tell them apart and
         * did not look at the claim, so a page saying so in its own markup was
         * still counted. Every other rule here honours it.
         */
        if (claimed[i]) {
          if (dotsEarned.length < 3) dotsEarned.push(`three dots — ${claims[i]}`)
          continue
        }
        dots++
      }
      found.push({
        key: 'window-dots',
        what: 'fake window dots',
        count: dots,
        samples: [],
        earned: dotsEarned
      })

      const trusted = /trusted by|loved by|used by [0-9]/i.test(text)
      found.push({
        key: 'trusted-by',
        what: 'a "trusted by" logo strip',
        count: trusted ? 1 : 0,
        samples: [],
        earned: []
      })

      const stock = ['pricing', 'faq', 'testimonial', 'features']
      const present = stock.filter(s => new RegExp(s, 'i').test(text))
      found.push({
        key: 'stock-sections',
        what: 'the stock section set (features, pricing, testimonials, FAQ)',
        count: present.length >= 3 ? present.length : 0,
        samples: present.length >= 3 ? present : [],
        earned: []
      })

      let arrows = 0
      const arrowSamples: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>('a, button, [role="button"]')) {
        if (el.closest('[data-earned]')) continue
        const t = (el.textContent || '').trim()
        if (!/[→›»⟶]/.test(t)) continue
        arrows++
        if (arrowSamples.length < 3) arrowSamples.push(`"${t.replace(/\s+/g, ' ').slice(0, 24)}"`)
      }
      found.push({
        key: 'cta-arrows',
        what: 'arrows welded to call-to-action labels',
        count: arrows,
        samples: arrowSamples,
        earned: []
      })

      const generic = [
        'Get Started', 'Get started', 'Elevate', 'Seamless', 'Supercharge',
        'Unlock', 'Effortless', 'Powerful', 'Learn More', 'Learn more'
      ].filter(w => text.includes(w))
      found.push({
        key: 'generic-copy',
        what: 'copy that would fit any product',
        count: generic.length,
        samples: generic,
        earned: []
      })

      return found
    },
    [DEFAULT_FACES.source, PURPLE_FROM, PURPLE_TO] as const
  )
}

async function check(browser: Browser, route: string, breakdown: boolean): Promise<number> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(ORIGIN + route, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(1200)
    const found = await collect(page)

    const hits = found.filter(f => f.count > 0)
    const earned = found.filter(f => f.earned.length > 0)
    const total = hits.reduce((n, f) => n + f.count, 0)

    console.log(`\n${route}`)
    if (hits.length === 0) {
      console.log('  nothing to answer for')
    } else {
      for (const f of hits.sort((a, b) => b.count - a.count)) {
        const sample = f.samples.length > 0 ? `  ${f.samples.join(', ')}` : ''
        console.log(`  ${String(f.count).padStart(4)}  ${f.what}${sample}`)
        // One line per rule beneath the total, because the decision is per
        // rule: this dt is an instrument readout, that span is a nav label.
        if (breakdown) for (const line of f.where || []) console.log(`      ${line}`)
      }
    }
    for (const f of earned) {
      console.log(`  earned: ${f.what}`)
      for (const line of f.earned) console.log(`          ${line}`)
    }
    return total
  } finally {
    await page.close()
  }
}

async function main() {
  const given = process.argv.slice(2)
  // --where breaks the two triage rules down by the selector that sets them.
  const breakdown = given.includes('--where')
  const args = given.filter(arg => arg !== '--where')
  if (args.length === 0) {
    console.error('pnpm tells [--where] <route> [route ...]')
    process.exit(1)
  }
  const routes = args.map(arg => routeFrom(arg, 'tells'))

  const state = await ensureServer()
  console.log(`dev server ${state}`)

  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-swiftshader']
  })

  const totals: [string, number][] = []
  try {
    for (const route of routes) totals.push([route, await check(browser, route, breakdown)])
  } finally {
    await browser.close()
  }

  if (totals.length > 1) {
    console.log('\nloudest first:')
    for (const [route, n] of totals.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${route}`)
    }
  }

  /*
   * Always zero. Several of these are legitimate where the subject earns them,
   * and a command that fails on a judgement call is a command people start
   * passing a flag to silence. Read it, then look at the page.
   */
  console.log('\nserver left running. This reports; it does not judge.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
