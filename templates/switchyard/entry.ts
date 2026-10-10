/*
 * Switchyard's recorder handle.
 *
 * The page mounts no library items: everything on it is its own inline CSS,
 * SVG and script, which is what an adapted template is. All this does is
 * expose the shared scroll driver, which is the one thing the recorder needs
 * from a page and the one thing the page does not provide for itself.
 */
import { mountScrollDriver } from '../_shared/scroll-driver'

mountScrollDriver()
