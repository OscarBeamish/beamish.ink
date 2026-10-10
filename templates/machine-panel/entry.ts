/*
 * MachinePanel's recorder handle.
 *
 * The page mounts no library items: everything on it is its own inline CSS,
 * SVG and script, which is what an adapted template is. So all this does is
 * expose the shared scroll driver, which is the one thing the recorder needs
 * from a page and the one thing the page does not provide for itself.
 *
 * It deliberately does not touch the machine's own simulation. That loop stops
 * itself when the panel leaves the viewport, and the recorder's scroll keeps it
 * on screen for the part of the take where it matters.
 */
import { mountScrollDriver } from '../_shared/scroll-driver'

mountScrollDriver()
