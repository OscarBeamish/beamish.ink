/*
 * The meta.json contract.
 *
 * meta.json is the single source of truth for an item. Prompts, docs pages, the
 * site index and prop tables are all generated from it plus recipe.md — nothing
 * is maintained twice. `pnpm generate:check` fails if generated output is stale.
 *
 * Validated here at build time so a typo in a slug fails the build rather than
 * shipping a prompt that 404s.
 */

import { z } from 'zod'

const slug = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'slug must be kebab-case')

/**
 * One tweakable option. This is a JSON Schema in all but name — it carries type,
 * default and range — but it is shaped for the two things we actually generate
 * from it: a prop table and a prompt section that tells an agent what a sensible
 * value looks like. A bare JSON Schema cannot express "sensible", and an agent
 * handed a bare `number` will pick 1000.
 */
const optionSpec = z
  .object({
    type: z.enum(['number', 'boolean', 'string', 'color', 'enum']),
    default: z.union([z.number(), z.boolean(), z.string()]),
    description: z.string().min(1),
    /** Inclusive bounds. Required for numbers so prompts can state a range. */
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    unit: z.string().optional(),
    values: z.array(z.string()).optional(),
    /**
     * The narrower band that actually looks good, when it is tighter than
     * min/max. Prompts lead with this; the demo slider still allows the full
     * range so people can find the edges themselves.
     */
    sensible: z.tuple([z.number(), z.number()]).optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === 'number') {
      if (value.min === undefined || value.max === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'number options must declare min and max'
        })
      }
      if (typeof value.default !== 'number') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'default must be a number' })
      }
    }
    if (value.type === 'enum' && (!value.values || value.values.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'enum options need values' })
    }
    if (value.type === 'boolean' && typeof value.default !== 'boolean') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'default must be a boolean' })
    }
  })

/** A file the agent fetches. `to` is where it lands in the host project. */
const fileSpec = z.object({
  /** Repo-relative path. Becomes a raw URL pinned to a tag at site build. */
  from: z.string().min(1),
  /** Suggested destination, relative to the host project's source root. */
  to: z.string().min(1),
  role: z.enum(['core', 'runtime', 'shader', 'adapter', 'style', 'component'])
})

const pointerKey = z.object({
  t: z.number().min(0),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
})

/**
 * Tier 2 has no render loop to drive, so the recorder replays a script instead.
 * `at` is seconds from the start of the take.
 */
const interactionStep = z.object({
  at: z.number().min(0),
  action: z.enum(['move', 'click', 'hover', 'key', 'scroll', 'wait']),
  /** CSS selector, for actions that target an element. */
  target: z.string().optional(),
  /** 0–1 viewport coordinates, for `move`. */
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  /** Key name for `key`, e.g. "Escape" or "ArrowDown". */
  key: z.string().optional(),
  /** Pixels for `scroll`. */
  by: z.number().optional()
})

const recordSpec = z.object({
  /** Seconds. The loop must be seamless across this span. */
  duration: z.number().positive().default(5),
  fps: z.number().int().positive().default(60),
  /** Frame used for poster.jpg, in seconds. */
  posterAt: z.number().min(0).default(2.5),
  /*
   * Quality overrides, for the rare item that is pathological for a video codec.
   * A full-frame halftone at 30fps is nearly all high-frequency detail, so almost
   * every pixel changes every frame and there is nothing to predict — it encodes
   * an order of magnitude larger than a scene of smooth shaded forms. Raising
   * these for such an item is a deliberate trade of quality against a repo where
   * every media file is committed forever.
   */
  crf: z.number().int().min(0).max(63).optional(),
  webmCrf: z.number().int().min(0).max(63).optional(),
  /** Tier 2 only. */
  interactions: z.array(interactionStep).optional()
})

const creditSpec = z.object({
  /** Where the *concept* came from. Never the code — every line here is ours. */
  what: z.string().min(1),
  author: z.string().min(1),
  url: z.string().url()
})

export const metaSchema = z
  .object({
    /** Single CamelCase concrete noun. Memorable and searchable. */
    name: z.string().regex(/^[A-Z][A-Za-z]+$/, 'name must be a single CamelCase word'),
    slug,
    tier: z.union([z.literal(1), z.literal(2)]),
    /** One sentence, sentence case, no full stop. Used on cards and in prompts. */
    description: z.string().min(10).max(160),
    category: z.enum([
      'backdrops',
      'reveals',
      'pointer',
      'type',
      'surfaces',
      'navigation'
    ]),
    tags: z.array(z.string()).min(1),

    /** npm packages the host project must already have, or install. */
    peerDependencies: z.record(z.string()).default({}),

    browser: z.object({
      webgl: z.enum(['none', 'webgl1', 'webgl2']).default('none'),
      notes: z.array(z.string()).default([])
    }),

    perf: z.object({
      /** Rough draw cost at 1280×720, 2× DPR, on integrated graphics. */
      frameBudgetMs: z.number().positive(),
      /** Live WebGL contexts this item holds. Always 1 or 0 — see AGENTS.md. */
      contexts: z.number().int().min(0).max(1),
      notes: z.array(z.string()).default([])
    }),

    files: z.array(fileSpec).min(1),
    options: z.record(optionSpec),

    /** The line shown inside the demo panel. Without it, half of these look broken. */
    instruction: z.string().min(1).optional(),
    /** True for one-shot animations, which get a Replay control. */
    oneShot: z.boolean().default(false),

    /** Scripted cursor path for pointer-driven tier-1 items. */
    cursor: z
      .object({
        duration: z.number().positive(),
        keys: z.array(pointerKey).min(2)
      })
      .optional(),

    record: recordSpec,
    credit: creditSpec.optional()
  })
  .superRefine((value, ctx) => {
    if (value.tier === 1 && !value.files.some(f => f.role === 'core')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tier 1 needs a core file' })
    }
    if (value.tier === 2 && !value.files.some(f => f.role === 'component')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tier 2 needs a component file' })
    }
    if (value.tier === 2 && !value.record.interactions?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tier 2 items are recorded by replaying interactions — none declared'
      })
    }
    if (value.category === 'pointer' && value.tier === 1 && !value.cursor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pointer-driven tier-1 items need a cursor path or the recorder gets a still'
      })
    }
    /*
     * A recording is only seamless if it spans a whole number of loops. An item
     * with a 20s period recorded for 5s cuts mid-cycle and the video jumps —
     * which is the kind of thing nobody notices until it is on the homepage.
     */
    const period = value.options['period']
    if (period && typeof period.default === 'number') {
      const loops = value.record.duration / period.default
      if (!Number.isInteger(Number(loops.toFixed(6)))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `record.duration (${value.record.duration}s) is not a whole number of loops at the default period (${period.default}s), so the video will not loop seamlessly`
        })
      }
    }
    if (value.perf.contexts === 1 && value.browser.webgl === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'declares a WebGL context but no WebGL requirement'
      })
    }
  })

export type Meta = z.infer<typeof metaSchema>
export type OptionSpec = z.infer<typeof optionSpec>
export type FileSpec = z.infer<typeof fileSpec>
export type InteractionStep = z.infer<typeof interactionStep>

export const CATEGORY_LABELS: Record<Meta['category'], string> = {
  backdrops: 'Backdrops',
  reveals: 'Reveals',
  pointer: 'Pointer',
  type: 'Type',
  surfaces: 'Surfaces',
  navigation: 'Navigation'
}

export const CATEGORY_BLURBS: Record<Meta['category'], string> = {
  backdrops: 'Ambient scenes that sit behind your content',
  reveals: 'How things arrive on screen',
  pointer: 'What follows, or answers, the cursor',
  type: 'Text treatments',
  surfaces: 'Cards, panels, images',
  navigation: 'Menus, headers, page transitions'
}
