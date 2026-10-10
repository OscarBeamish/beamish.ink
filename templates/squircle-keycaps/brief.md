<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "BIGRED", a runbook-automation product with an AI operator, where every control on the page is a generated 3D keycap. Inter 400–900, JetBrains Mono and Material Icons from Google Fonts, everything else inline. Make the brand obviously fictional and say so in the footer.

BUILD THE KEY FIRST; IT IS THE DESIGN SYSTEM
Two functions do all of it.

- `S(w, h, r, x, y)` walks a superellipse: four quadrants, 31 samples each, where the offset from the corner is `sign(cos) * |cos|^0.6 * r` rather than a circular arc. That exponent is the whole point — a border-radius flattens on the straight edge, this never does.
- `createBtn(cfg)` stacks that path into something physical: a base plate offset 12px down and filled at 60% black, a stroked base at 80%, a run of one-pixel side slices filled with a vertical gradient (light at both edges, dark through the middle) between the base and the face, then the face itself. Pressing moves the face from y=4 to y=9 and shrinks the drop shadow, so the key travels onto its base instead of changing colour.
- Colour comes from one string of 22 hex triplets — eleven pairs of face and shade — indexed by name. Derive every other tone with `color-mix(in srgb, #hex N%, white|black)` so a new stop needs six characters, not a palette file.
- Width is measured, not guessed: render the uppercase label to a canvas 2D context at `900 15px Inter` and add 80px, or 100px when there is an icon. Square icon keys are fixed at 48. Height scales the whole SVG through `h / 40`.
- Variants: square icon-only, floating (a 24px drop shadow that halves on press), full-width (re-measure through a ResizeObserver), disabled. Give each key an `onPress` callback and a `set()` that re-renders with new colour or icon — that is what makes the page interactive rather than a swatch sheet.
- Accessibility: role=button, tabindex, and Enter/Space driving the same press states as the pointer.

THE PAGE AROUND THEM IS NEO-BRUTALIST BENTO
Space Grotesk and DM Mono, a warm paper ground with two radial tints, and every surface a bento card: 3px ink border, 22px radius, hard `7px 7px 0` offset shadow, flat poster colour (yellow, cornflower, pink, lime, purple, orange). No blur anywhere, no gradient fills on the furniture, one ink for every line.

THE TWO SYSTEMS MEET IN THE SHADOW
This is the whole trick — do not leave the keys looking imported:

- Swap the key's soft drop shadow for the page's hard one: `feDropShadow` with `stdDeviation="0"`, full opacity, flooded with the page ink, offset 6px at rest and 2px pressed — the same travel the bento pills use.
- Stroke the base and the face with the page's ink at the page's 3px weight instead of a tinted highlight. Keys placed on the ink-coloured inspector take a paper stroke instead, so they read as outlined either way.
- Keep everything else: the superellipse, the extruded slices, the face that travels, the measured widths, the eleven-stop ramp.
- Watch inherited `text-transform`. A key dropped inside an uppercased block will uppercase its Material Icons ligature, and "BACKUP" is not an icon — it is the word, drawn across the button. Set `text-transform: none` on the key and scope the uppercase rule to the label it was meant for.

SECTIONS

1. A bento top bar: a tiny square key as the logo mark, mono links, a white key as the sign-in.
2. Hero bento, split: copy on paper — with the second headline line in red, ink-stroked, on a hard yellow text shadow — and beside it a cornflower panel holding a rotating sun dial (a repeating conic gradient ring with an orange disc inside) with a 104px red power key counter-rotating at its centre. A pink circle bleeds out of the hero's bottom edge.
3. A dark console with a six-step run log. Pressing the hero key runs it: each step goes from idle to a spinning tick to a green done with its duration; the key itself turns slate and becomes a stop, the status line counts steps, and pressing again halts the run and rolls it back. Nothing is real — say so.
4. Four flat-colour stat cards — yellow, cornflower, pink, lime — with a mono label, a huge number and a line of context.
5. A readiness audit: a circular grade chip, a barber-pole meter that fills on a timer, a status line and two keys (run, export). Finishing it flips the grade chip to lime and raises a toast.
6. Registry: pill filters on the right of the section head, a two-column grid of runbook cards each with a coloured circle bleeding out of its bottom-right corner, and a sticky ink inspector beside them — scope badge, category, what it does, what it will not do, an approval box in lilac holding a square key, a "next key" key and a text button that copies the runbook and toasts.
7. Key system: the palette as eleven labelled keys, the same eleven as square icon keys, a 30/44/60px size ramp, one full-width key.
8. Three numbered playbook cards in cornflower, yellow and pink with a ghosted numeral, then a lime footer.
9. A floating support key and a bottom-right toast.

DETAILS THAT MATTER

- Load Material Icons and use ligature names (`restart_alt`, `power_settings_new`, `ac_unit`) as the tspan's text. Inside a JS-built SVG string, write the font family unquoted — an escaped quote inside a quoted attribute inside a JS string is how that breaks.
- Reveal sections with an IntersectionObserver adding a class, staggered by index; no animation library.
- Respect prefers-reduced-motion: no reveal travel, no spinner, and the demo run collapses to a fast tick-through.
- At 960px the hero stacks, cards and tiers go single column and the nav links hide.
