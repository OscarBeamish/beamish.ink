/*
 * The Plate demo, as an Astro island. See ContentsDemo for why this is an
 * island rather than a hand mount.
 */

import { Plate } from '@items/components/image-gallery-lightbox/react'
import { props } from './plate'

export default function PlateDemo() {
  return <Plate {...props} />
}
