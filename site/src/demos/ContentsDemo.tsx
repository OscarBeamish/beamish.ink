/*
 * The Contents demo, as an Astro island.
 *
 * Tier 2 is React, and the way Astro consumes React is a `client:*` island. An
 * earlier version imported this component from the panel's own <script> and
 * mounted it by hand, which works in a build and breaks in dev: the react
 * plugin injects a refresh preamble into the page only when an island is on it,
 * and its transformed output throws without one.
 */

import { Contents } from '@items/components/fullscreen-menu/react'
import { props } from './contents'

export default function ContentsDemo() {
  return <Contents {...props} />
}
