<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a premium, playful "Fire Button" toggle component as a single HTML file, plus a showcase page for it. No dependencies and no animation runtime: the flame is drawn procedurally on a 2D canvas, every frame, from the button's own state. Palette: #070410 ground, #0e0b18 raised, #151126 and #1d1630 lifted, with flame stops #ffd36b, #ff9a2e, #ff5a1f, #c2260f.

THE COMPONENT
- Declarative markup: <button class="fb" data-size="sm|md|lg|xl" data-off="Ignite" data-on="On fire" data-variant="icon" data-surface="light" aria-pressed="false">. FireButton.upgradeAll() builds the inside.
- Anatomy: a glass pill body (layered inset highlights, deep drop shadow) with a recessed circular socket holding the flame canvas, and a two-word label that slides between states. The on-state label is gradient text with a moving shimmer.
- The flame canvas is deliberately much bigger than the socket (260% wide, 440% tall, offset left -80% and bottom -20%) so a lit flame towers out of the socket instead of being clipped by it.
- Size the backing store from the socket's measured width, and measure it in a ResizeObserver rather than in the frame loop: reading offsetWidth per frame forces a reflow per button per frame.

THE FLAME (the whole trick)
Draw it in layers, bottom up, every frame from four numbers - lit, hover, charge and a heat multiplier:
- A slate-blue root that is all you see when the button is off, so an unlit button still reads as a pilot light rather than a dead icon.
- Four side tongues, each licking on its own sine rhythm, then red to orange to gold teardrops, each with its own shadowBlur glow. One bezier helper draws every teardrop: two symmetric curves from a base point to a tip, with a lean term that shifts the tip.
- A stream of additive particles indexed by frame number and run through a hash, so the stream is stable rather than random per frame, with a few wisps that break off past the tip.
- A white-hot core at the base.
Everything wobbles on layered sines at different frequencies seeded per button, so no two buttons flicker in step. Under prefers-reduced-motion freeze the time input entirely: the flame still grows and shrinks with state, because that is feedback, but it stops flickering.
- On state: a warm body tint, a breathing radial heat glow, and a spinning conic "heat ring" border (@property --angle, masked to a 2px outline).
- Magnetic hover pull via a translate on the body; press squash via the individual scale property with a spring easing.

INTERACTIONS
- Tap toggles through the click event, so assistive tech works. Holding past 250ms charges an SVG ring around the socket (pathLength=1 dashoffset); completing it in 900ms fires supercharge(). Releasing early cancels without toggling.
- Space and Enter are handled on keydown/keyup so holding either charges too.
- Ignite: an ember burst, an expanding shockwave outline, an optional haptic pulse and an optional synthesized whoosh plus crackle (Web Audio noise through a swept bandpass; off by default).
- Extinguish: a puff of smoke.
- Supercharge: a 2× burst, a wiggle, and a full-screen scorch flash.
- Emit firebutton:change {on}, firebutton:supercharge and firebutton:input {name, value}.

EMBER ENGINE
One fixed full-viewport canvas shared by every button, DPR-aware (set its CSS size to 100%). Particles rise and sway with additive blending. Pre-render one soft radial-gradient glow sprite per color instead of flat circles. Cap at 700 particles and sleep the loop when empty. Lit, visible buttons trickle ambient embers. Stop drawing offscreen buttons with an IntersectionObserver, and skip the full-viewport clear entirely when no particles are alive, so an idle page does no per-frame work. Honour prefers-reduced-motion.

SHOWCASE PAGE (dark, Bricolage Grotesque + Instrument Serif italic accents + JetBrains Mono labels)
1. Sticky top bar: brand, breadcrumb, version tag, section links.
2. Hero: "Buttons that feel alive." with hint chips, live counters (ignitions, supercharges) and a decaying heat meter. Beside it, a stage card with an XL button, live ON/Hover input chips, and playground controls: size, label set, dark/light surface, ember and sound switches, and a heat-intensity slider that scales glow and particle counts.
3. Variants: primary; icon-only in three sizes; light surface (the cream body keeps a dark socket); and a habit streak tracker that lights today's day when the button fires.
4. Anatomy: three cards covering the state machine, tap vs. hold, and the ember engine.
5. Usage: a syntax-highlighted snippet with a copy button, and attribute/method/event reference cards.
6. A closing "Go on, set it off." CTA with one more button.
