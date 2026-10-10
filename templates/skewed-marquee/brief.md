<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML template called "SKEWSHOP": infinite marquee bands with no JavaScript in the animation, thrown by one physical-looking spin button. The button is a Rive artboard, inlined as base64, loaded from @rive-app/canvas on jsDelivr. Inter Tight and JetBrains Mono from Google Fonts. Every poster is inline SVG — nothing is fetched.

PROBE THE BUTTON FIRST
Artboard "BUTTON" 1280x720, state machine "State Machine BTN", three booleans:
- hover → glow_hover_in, arrow_hover_in. The dome only lights while hovered; at rest it is dim.
- click → button_down, click_on.
- SPIN/STOP → swaps the readout plate between "PRESS TO SPIN" (green) and "PRESS TO STOP" (red), and decides which colour the hover glow is. Green means pressing will start it; red means pressing will stop it.
Three rules come out of the file, and all three are load-bearing:
1. **Pulse click, never hold it.** Holding it true leaves the machine transitioning forever and the page stops answering entirely. Set it, clear it ~120ms later.
2. **Drop hover for the duration of that pulse.** With hover true AND click flipping, the HOVER_ARROW layer cycles and the runtime logs "exceeded max iterations" every frame — about fifty per press. Clear hover, pulse, restore it a beat later if the pointer is still there.
3. **Do not touch SPIN/STOP until the artboard's intro has played** (~1.6s). It opens by playing its readout plate in; interrupt that and the TXT layer strands mid-morph and the plate renders as a bare line.

DESIGN SYSTEM (sampled from that artboard, not invented)
Panel #3f4346 → #4f5256 with a #c3ccd5 light spill at the top and a #242527 deck below — the page is the machine the button is mounted in, so the body carries that same gradient down the document. Chrome #8a9095, shadowed #5b5f63, highlight #dbdfe3. Dome green #79ec54 lit, #849d8d at rest; red #ff7b81 with an #ec9b54 core while running. Readout plate #282b2c behind a 2px chrome border. One bevel token — inset 0 1px 0 rgba(255,255,255,.22), inset 0 -2px 3px rgba(0,0,0,.55) — is reused by every raised part: chips, buttons, cards, the console frame. Inter Tight for text, JetBrains Mono for anything that reads like a readout.

THE RAIL (unchanged engine, new skin)
- A `.marquee` is a flex row, `overflow: hidden`, `gap: var(--gap)`, holding TWO identical `.marquee__group` children: `flex-shrink: 0`, `min-width: 100%`, `justify-content: space-around`, each running `animation: scroll var(--duration) linear infinite`.
- The keyframe ends at `translateX(calc(-100% - var(--gap)))`, NOT `-100%`. Miss the gap and the strip jumps one gap every cycle.
- Mark the duplicate group `aria-hidden="true"`. Put `will-change: transform` on the group, not its children. Pause on `:hover` AND `:focus-within`. Reverse is the same keyframe with `animation-direction: reverse` and `animation-delay: calc(var(--duration) / -2)`. Mask both edges.
- A vertical rail is the same thing with `flex-direction: column`, `translateY`, and an explicit height on the rail — without a height the group has nothing to be 100% of, travels zero pixels, and fails silently.

STRUCTURE
1. Sticky blurred bar: wordmark with a dome that takes the running colour, four anchors, and a live "REELS SPINNING / STOPPED" readout plate with role="status".
2. Hero, full-bleed and at least a screen tall, in three layers. **The reels go BEHIND it** — three skewed bands (posters, a monospace readout band, posters reversed) absolutely positioned and overscanned by ~8% so the skew never shows a corner, at 0.62 opacity. Then a scrim: a radial darkening centred behind the type plus a vertical pair, so white text sits on moving posters comfortably. Then the content. The reels layer is decoration — aria-hidden and pointer-events: none, so it never eats a click or a caret.
3. On top: a two-row headline set in blocks rather than split by a <br>, so each row owns its colour and neither can rewrap into the other — PRESS IT in the ink, EVERYTHING SPINS in the system's red, the same one the spinning state uses. No eyebrow above it. Size it off a clamp whose cap carries the display size and whose slope is steep enough that the longer row still lands on one line at 390px; measure the row heights rather than trusting it. Then the console — the Rive canvas in a chrome deck (16:9), with a transparent round <button> sitting exactly over the dome (x 40.7–59.3%, y 19.7–60.7% of the artboard, measured from a render). That button owns hit-testing and keyboard access, so set shouldDisableRiveListeners. Under it, a lamp and a "Rive · State Machine BTN" caption.
4. Pressing it toggles ONE class on <body> and every rail on the page obeys. This is the whole point of the layout: the thing the button controls is already on screen when you press it, so the press has a visible consequence without scrolling. Stopped reels also drop to 0.4 opacity and desaturate, which makes the state legible even in a still frame. The page loads with the reels running, so the plate reads "press to stop".
5. "Six things this rail can be": the callout naming the `-100% - gap` trap, then six cards that are panels off the same machine. Each carries a CSS rebuild of the button — chrome bezel, glass dome, a specular cap, the spin glyph — and a readout plate for its label. Give them the button's rule, not its job: **dim at rest, lit only when reached for.** On hover the glass goes from #62796a to the dome's green, a glow blooms under it, the glyph turns 38°, the plate's lamp lights, and the card lifts 4px while a specular pass crosses the chrome. None of it does anything — it is material, shared, so the cards and the button read as parts of one object.
6. A vertical rail section with the height warning, a closing band skewed the other way, and a short footer. The hero's rails are decoration; the vertical rail keeps its hover-pause so the behaviour stays demonstrable.

FALLBACKS AND DETAIL
- Rive is the skin, not the logic. Behind the canvas sits a CSS dome and plate built from the same tokens; the page works with the class toggle alone, and under prefers-reduced-motion Rive never loads and every rail is paused rather than hidden.
- Load the runtime lazily on an IntersectionObserver, and resize the drawing surface on window resize.
- `overflow-x: clip` on the body — not `hidden` — so skewed bands overhang without a scrollbar and the sticky bar still sticks. Do not use `background-attachment: fixed` for the panel gradient; iOS treats it as scroll and it leaves everything outside the viewport unpainted.
- Skip link, focus-visible rings, aria-pressed on the console button with an sr-only label that says what the press will do, role="group" on the segmented control, no horizontal scroll at 390px.
