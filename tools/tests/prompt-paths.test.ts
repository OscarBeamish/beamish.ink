/*
 * Every file a prompt tells an agent to fetch is a file that exists.
 *
 * A prompt is the whole product here: nobody installs this library, they paste
 * the instructions and an agent follows them literally. A URL in the fetch
 * table that points at a path nobody has moved is invisible in review, passes
 * every other check, and fails in somebody else's project with a 404 and no
 * explanation.
 *
 * The paths are read back out of the generated prompts rather than recomputed
 * from meta.json, because recomputing them would test the same function that
 * wrote them and agree with itself. These are the strings an agent will
 * actually request.
 *
 * This is the half that is easy to get right. The other half, a file the page
 * needs that the prompt forgot to list, does not show up here: the template
 * prompts shipped without meta.json in the table for exactly as long as it
 * took somebody to read one.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GENERATED = path.join(ROOT, '.generated')

/** The repo path out of every raw.githubusercontent URL in a prompt. */
function fetchedPaths(markdown: string): string[] {
  const found = new Set<string>()
  for (const match of markdown.matchAll(/\{\{PIN\}\}\/([^\s|)]+)/g)) {
    found.add(match[1]!)
  }
  return [...found]
}

const prompts = existsSync(GENERATED)
  ? readdirSync(GENERATED, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .flatMap(entry =>
        ['prompt.md', 'prompt.inline.md']
          .map(name => path.join(GENERATED, entry.name, name))
          .filter(existsSync)
          .map(file => ({ slug: entry.name, file }))
      )
  : []

describe('every prompt fetches files that exist', () => {
  it('found prompts to check', () => {
    expect(prompts.length).toBeGreaterThan(0)
  })

  for (const { slug, file } of prompts) {
    const name = path.basename(file)
    it(`${slug}/${name}`, () => {
      const missing = fetchedPaths(readFileSync(file, 'utf8')).filter(
        repoPath => !existsSync(path.join(ROOT, repoPath))
      )
      expect(missing, `${slug}/${name} fetches paths that do not exist`).toEqual([])
    })
  }
})
