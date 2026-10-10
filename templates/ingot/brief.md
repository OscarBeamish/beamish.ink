<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is the
  generated Beamish prompt, written into .generated/<slug>/.

  Named brief.md and not prompt.md: pnpm generate writes prompt.md for
  every item in the repo, and overwrote this file the first time round.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence. It is here because it explains why the page is
  built the way it is, which no amount of reading the markup will.
-->

Build a single-file HTML landing page for "Kiln", a fictional on-premise inference appliance, where the page IS the machine's front panel. Archivo and JetBrains Mono from Google Fonts, everything else inline. No images - every screw, blade, gauge and LED is CSS or inline SVG. Say in a legal line that the product and every reading are invented.

THE FOLD
There is no separate hero. The headline is etched into the chassis as a nameplate across the top of the machine - stencil line, h1, one paragraph, and a small lamp cluster on the right - so the working instrument starts inside the first screen instead of underneath half a page of copy. Budget the machine to about 780px tall: a nameplate that wraps to three lines will push it past 950 and cut the readouts off the bottom, so keep the headline measure wide (24ch) rather than narrow and tall.

THE BOOT
The page wakes itself about 560ms after load, because the first thing a visitor should see is the machine coming up rather than a dead panel waiting to be clicked. Three things fire together: a one-shot amber flash across the plate, a stepped opacity flicker on the power lamp so it catches before it latches, and an instrument self-test where the gauge runs all 34 ticks to the stop, holds, falls back, and only then hands over to the real load. Everything downstream - fan spin-up, coil glow, the four readouts - comes free from the load integrating.
Under prefers-reduced-motion skip all of it and start already running: no flash, no flicker, no sweep, no spinning turbine, but every switch, gauge and readout still live.

THE MATERIAL
Near-black #0a0a0c with iron plates at #1f2126 to #17181c. One .plate class carries the whole page: a 14px radius, a 162deg gradient, an inset top highlight, a deep inset bottom shade and a long drop shadow. On top of that a ::before paints wear - three soft rust-coloured radial patches and a 118deg repeating weave - and a ::after lays down a fractalNoise feTurbulence data URI at overlay blend.
Keep that grain on the plates, not on the viewport. A fixed full-screen noise layer with mix-blend-mode forces the entire page through an extra compositing pass on every animated frame, and on a page with a permanently spinning fan that is the difference between 47fps and 60.
Four screws hold every plate down: a 15px radial-gradient circle with an inset shadow and a ::after slot rotated a different amount per corner, so they do not look stamped.

THE INSTRUMENTS
- A turbine in a recessed circular well. Eleven swept blades generated in a loop, each running hub to rim with a 24 degree twist - narrow and swept, because wide petals read as a flower rather than a fan. Spin it with a CSS animation whose period is a custom property.
- Two rocker switches: an LED that goes green (or red for turbo), a 30x48 body whose highlight slides from top to bottom when thrown, and a small grille beneath. Turbo without power does nothing except blink the power lamp.
- A semicircular arc gauge of 34 radial ticks placed with trigonometry. Ticks light cyan up to the current load and turn ember in the top fifth.
- A card slot, a "warming rays" window with five glowing coil bars whose opacity and glow radius read from the heat property, and a four-cell readout of tokens per second, core temperature, draw and queue.

THE SIMULATION
One number drives everything. Integrate load toward a target per frame - zero when off, about 0.35 idling, about 0.86 in turbo - and derive the fan period, the lit tick count, the coil glow and all four readouts from it.
Write those custom properties on the machine element, never on the document, and only when the value actually changes: setting a custom property on :root every frame invalidates style for the whole page. Quantise the fan period to a tenth of a second too, because re-timing a running animation sixty times a second is worse than not animating at all.
Run the frame loop only while the panel is on screen and stop it once the machine is off and cold. Under prefers-reduced-motion stop the turbine outright - it is the page's one continuous motion - while leaving every switch, gauge and readout working.
