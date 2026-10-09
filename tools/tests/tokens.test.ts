/*
 * The contrast ratios written in tokens.css are the real ones.
 *
 * Every step in that file carries its ratio in a comment, and a comment is a
 * claim nobody checks. They were right when they were written and then one
 * ground became two: the dark palette was built by copying the paper one and
 * changing the colours, which is exactly the move that leaves a stale number
 * sitting next to a value it no longer describes.
 *
 * So the comments are parsed rather than read. Each one is recomputed from the
 * token it annotates and has to agree to a hundredth, and separately each step
 * has to actually pass the level it is used at. The second half is the one that
 * matters: a documented 2.59:1 is still documented.
 *
 * This caught white on the dark accent. The paper accent is a surface that
 * carries white text at 5.03:1, so the obvious thing is to keep that pairing on
 * the dark palette, where the accent is brighter and the same pairing is
 * 2.59:1. The fix is --accent-ink, and this test is why it exists.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CSS = readFileSync(path.join(ROOT, 'shared', 'tokens.css'), 'utf8')

type Rgb = [number, number, number]

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
  return (hi + 0.05) / (lo + 0.05)
}

/** What a partly transparent ink actually becomes once it is over the ground. */
function flatten(ink: Rgb, alpha: number, ground: Rgb): Rgb {
  return ink.map((c, i) => c * alpha + ground[i]! * (1 - alpha)) as Rgb
}

function hex(value: string): Rgb {
  const short = value.length === 4
  const at = (i: number) =>
    short
      ? parseInt(value[1 + i]!.repeat(2), 16)
      : parseInt(value.slice(1 + i * 2, 3 + i * 2), 16)
  return [at(0), at(1), at(2)]
}

/** The body of one `:root[data-ground='…']` block. */
function block(ground: string): string {
  const start = CSS.indexOf(`:root[data-ground='${ground}']`)
  expect(start, `no block for ${ground}`).toBeGreaterThan(-1)
  return CSS.slice(start, CSS.indexOf('}', start))
}

/** A declaration's value and the ratio its comment claims, if it makes one. */
function declaration(body: string, name: string) {
  const line = body
    .split('\n')
    .find(l => l.trimStart().startsWith(`--${name}:`))
  expect(line, `no --${name}`).toBeTruthy()
  const value = line!.slice(line!.indexOf(':') + 1).split(';')[0]!.trim()
  const claimed = line!.match(/([\d.]+):1/)
  return { value, claimed: claimed ? Number(claimed[1]) : null }
}

const GROUNDS = [
  { name: 'paper', steps: ['label-1', 'label-2', 'label-3', 'label-4', 'control-line', 'line'] },
  { name: 'dark', steps: ['label-1', 'label-2', 'label-3', 'label-4', 'control-line', 'line'] }
] as const

/* Steps that are rules and surrounds rather than type, so AA does not apply. */
const NOT_TEXT = new Set(['label-4', 'line'])

describe('tokens.css documents the contrast it actually has', () => {
  for (const { name, steps } of GROUNDS) {
    describe(name, () => {
      const body = block(name)
      const ground = declaration(body, 'background-deep').value
        .split(',')
        .map(n => Number(n.trim())) as Rgb
      const label = declaration(body, 'label').value.split(',').map(n => Number(n.trim())) as Rgb
      const labelD = declaration(body, 'label-d').value.split(',').map(n => Number(n.trim())) as Rgb

      for (const step of steps) {
        it(`--${step}`, () => {
          const { value, claimed } = declaration(body, step)
          const alpha = Number(value.match(/,\s*([\d.]+)\s*\)/)![1])
          const ink = value.includes('--label-d') ? labelD : label
          const actual = contrast(flatten(ink, alpha, ground), ground)

          expect(claimed, `--${step} has no documented ratio`).not.toBeNull()
          expect(actual).toBeCloseTo(claimed!, 1)

          if (!NOT_TEXT.has(step)) {
            expect(actual, `--${step} is used as text and must reach 4.5:1`).toBeGreaterThanOrEqual(4.5)
          }
        })
      }

      it('--accent reads as text on its own ground', () => {
        const { value, claimed } = declaration(body, 'accent')
        const actual = contrast(hex(value), ground)
        expect(actual).toBeCloseTo(claimed!, 1)
        expect(actual).toBeGreaterThanOrEqual(4.5)
      })

      /*
       * The pairing, not the colour. This is the assertion that failed first:
       * white is right on one ground and wrong on the other, and nothing about
       * either colour on its own says so.
       */
      it('--accent-ink reads on the accent', () => {
        const accent = hex(declaration(body, 'accent').value)
        const inkValue = declaration(body, 'accent-ink').value
        const ink = inkValue.startsWith('#') ? hex(inkValue) : ground
        expect(contrast(ink, accent)).toBeGreaterThanOrEqual(4.5)
      })
    })
  }

  /*
   * No fallback palette. A page that forgets data-ground should get nothing and
   * look broken, rather than silently inheriting whichever ground was written
   * first, which is the whole failure this file was restructured to end.
   */
  it('declares no ground colours outside a named ground', () => {
    const bare = CSS.slice(CSS.indexOf('/* Ground-independent.'))
    for (const token of ['--background-deep', '--label-1', '--accent:']) {
      expect(bare.includes(token), `${token} is set outside a ground block`).toBe(false)
    }
  })
})
