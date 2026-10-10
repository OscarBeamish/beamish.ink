<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML launch page for "Umbra", a fictional inference runtime, staged like a product reveal under theatre lights. Archivo and JetBrains Mono from Google Fonts, everything else inline. No images and no libraries - every beam, mountain and particle is CSS or canvas. Say in a legal line that the product and every claim are invented.

THE STAGE
One 44em section holds the whole fold, position: relative and overflow: hidden, layered back to front: three conic spotlights, a dust canvas, the drafting frame, the type, and a ridge of lit mountains along the bottom.
Size the whole composition off one custom property - --size: min(min(600px, 80vh), 80vw) - and set the body font-size to 3% of it with a 10px floor, so the stage scales as a single object instead of as a pile of independently responsive parts.
Place the stage's children with percentages of the stage, not em. A top value in em resolves against the element's OWN font-size, so a 1.15em tagline at top: 24.4em lands 15% lower than the 1em grid around it - which is exactly how it ends up sitting on the mountain peaks.

THE SPOTLIGHTS
Each beam is a conic-gradient from 0deg at 50% -5%: transparent to 45%, the accent at 30/52/30 percent opacity across 49-51%, transparent from 55%. Give it a 30em width, an 86vh height, a bottom border-radius of 50% and transform-origin at the top centre, then blur it. Two of the three are rotated 20 and -20 degrees. They scale up from nothing on load and then drift forever.
Put the drift on a wrapper and the blur on the cone inside it. Keyframing scale() on the blurred element re-blurs a 30em layer every single frame; moving the transform to a parent lets the blurred cone rasterise once and be re-composited. Measured on the same software rasteriser that is 33fps against 45. Do not reach for will-change here - promoting three large blurred layers made it worse, not better.

THE DUST
A canvas of fine specks rising from the bottom edge, one per 2600 square css pixels, each a 1px-wide rect of random length, alpha and speed that holds and then fades out. Cap devicePixelRatio at 2.
Drive the rise and the fade in seconds off the frame delta, never in per-frame decrements, or every particle lives half as long on a 120Hz display. Guard the canvas resize behind an actual dimension change too: assigning width or height wipes the bitmap and resets fillStyle, and a ResizeObserver's own first callback will happily do that straight over the frame you just drew.

THE FRAME
A hairline grid, and it runs the length of the page rather than stopping at the fold - that is the point of it. Four verticals, and horizontals wherever a section starts or stops, with a small node dot at every crossing.
Express the vertical offsets as percentages of the viewport - roughly 28.5% and 40.5% in from each edge - not in em. Fixed em offsets measured from opposite edges swap sides somewhere around 1000px and end up 35px apart in the dead centre of the page at 900; percentages stay evenly distributed at every width and let you keep the outer pair on a phone instead of hiding the frame there.
The stage owns the top of the grid and a second layer owns everything below it. Because the lower section is a stacking context, that layer can sit at z-index -1 - above its own background, behind all of its content - so you do not have to make every section positioned just to stay on top of the grid. Both layers measure from the same viewport edges, so they line up as one continuous frame with no measuring.
The stage's grid scales in on load. The horizontals below it draw themselves out from the middle on an IntersectionObserver as you reach them, with the nodes fading in a beat behind the line, so the frame keeps assembling the whole way down instead of arriving all at once.

THE TYPE
A monospace "Introducing" eyebrow with a gradient rule fading out either side, then the wordmark at 7em.
Register @property --p as a percentage and animate it 0 to 300%. The wordmark's background is a 2em radial gradient at that position sitting over the base gradient, clipped to the text, so a highlight travels across the letterforms. Print the wordmark a second time behind the first with the same sweep blurred at 16px so the light bleeds past the glyphs.

THE RIDGE
Three squares rotated 45 degrees with inset box-shadows for the lit edges and a repeating-radial-gradient in one corner for the contour texture, sliding up from below into a horizon. A ::before over them fades to the page background so their bases dissolve into haze - run that fade over three stops, not two, or the mask ends in a visible horizontal seam across the full width.

THE STAGE LIGHT
The dot in the header swaps the whole page from cold moonlight to warm gold. Do it by redefining five custom properties under a body class, not with filter: invert - inverting turns the gradients to mud, and the dust should pick up the new colour too.

BELOW THE FOLD
A centred pitch with two concentric-ring accent shapes floating either side, then three capability cards, one wide card for the platforms it runs on, a strip of four figures, and a close. Balance the card headlines so none of them orphans a word, and label the figures as invented on the page, not just in the footer.

THE CARDS
One card component carries all three sections. A plate fills the card with a 3px gradient frame; inside it a dark face with asymmetric corners - roughly 13px, 99px, 40px, 13px clockwise from the top left - so the tint only shows as a hairline down most of the edge and swells into a crescent where the face pulls back off the corner. A gradient disc turns slowly behind it, a frosted panel floats over the left with the copy, and a rail of small mono type runs down the right ending in a circular chevron.
Keep the face opaque. That is what stops the drafting frame crossing the copy: the grid stays in the gutters between cards and behind nothing you have to read. Check it by sampling pixels rather than by eye - a rail should add zero brightness inside a card face and about +34 in the gutter beside it.
Push the disc against the right edge so it reads crisp in the rail gap and frosted behind the panel. Centre it and a wide panel swallows it whole, leaving a grey blur under the body copy and no disc at all. On the figure cards, which have no rail, reserve the same strip by hand or you get the blur with nothing to show for it.
Tint the panel glass dark rather than white. White frost over a bright disc does nothing to it, and the longest line of copy ends up sitting in the glare.
A disc turns only while its card is on screen. Every frosted panel over one has to re-read and re-blur its backdrop whenever it moves, so an offscreen card that keeps spinning pays full price for nothing. Track the on-screen set rather than toggling a class straight off the observer, or coming back to the tab leaves every disc parked - returning is not an intersection change.

TYPE FLOOR
Everything scales off --size, which on a phone is driven by 80vw, so the mono labels land between 6px and 9px there. Floor the base at 13px and give each small label its own max(0.6em, 10px) so the page stays legible when the composition shrinks.
Under prefers-reduced-motion the stage still arrives, it just arrives already assembled: beams at full opacity, mountains in place, the whole frame drawn with its nodes, one still frame of dust, and the stage light still switches.

THE FIELD — one frame for the whole page
Do not give each section a few rules of its own. Fix one drafting frame to the viewport and let the page slide past it: brackets in the four corners and a labelled depth axis, and nothing else. Resist ruling it. A full grid of verticals and horizontals is the obvious version and it is the wrong one — the lines run straight through the type and the artwork, and the page ends up sitting ON a diagram instead of being annotated by one. A ruler across the top has the same problem in miniature: it lands directly under whatever the eye goes to first. What survives is the margin notation, which says the same thing and competes with nothing.
Pin the axis and the brackets to ONE inset and let the axis span the full frame, top corner to bottom corner. At any inset short of that it sits inside the measure the content is set in and something eventually runs into it. Push the labels past the bracket's own arm or the first and last of them land on top of it. Two line weights, not one, and draw the lot in the variable the stage light swaps so the frame changes colour with the lamp.
Layering is the part that will bite. A page like this usually has an opaque panel under its lower half at a high z-index, which buries anything fixed behind it. Turn that panel into a ::before backdrop at z-index -1 and drop the wrapper's own z-index so it stops being a stacking context — then the backdrop escapes to the root, the fixed frame paints over it, and the sections lift to z-index 1 to paint over the frame. Backdrop, frame, content, in that order.
A fixed frame is wallpaper unless something in it moves with the reader, so put a cursor on the depth axis: a mark and a three-digit readout that ride the scroll. One custom property and one text node per frame, written from a rAF off a passive scroll listener, nothing that touches layout.
Two traps. A second line weight built as a color-mix of the first at more than 100% comes back unchanged, because a single percentage over 100 is clamped — declare the heavier weight outright. And when you switch the sweep off for reduced motion, match the specificity of the rule that started it; a two-class override loses to a three-class rule even inside a media query.

THE LAMP STAYS PUT
The bar and the light are fixed to the viewport and live outside the stage, not inside it: the lamp holds its place while the page runs underneath, so whatever section you have scrolled to is the one being lit. Put the cones on the same layer as the background frame — over the frame and over the lower page's panel, under the content of whatever section is on screen — so the light reads as falling behind the words rather than washing them.
Lifting the bar out of the stage is not optional. A fixed element inside a wrapper that is itself a stacking context has its z-index resolved INSIDE that wrapper, so a bar at z-index 60 in there still paints under a section at z-index 1 outside it, and the thing you just fixed to the viewport disappears the moment you scroll. Move it to the body.
One control, three states, cycling cool then warm then out then back. The two lit states are a palette swap; the third kills the cones and leaves the bulb a dark disc with a cold rim, which is the moment the background frame has to carry the page on its own. aria-pressed has two values and cannot describe three — let it track lit against unlit and put the real state in the label, updated on every press.
Set the two ends of the bar as one object at opposite insets: same size, same weight, same resting opacity, same hover. A pill on one side and a wordmark on the other never sit on the same line however carefully you nudge them, because one has a box and the other does not — and a bar with a lamp in the middle of it wants both ends to be type. Keep the boxed treatment for the call to action at the foot of the page, where it is the only thing on the line.
Leave the scroll indicator as the mark alone. A readout beside it is a second thing to read at the edge of the eye, in the one place on the page nothing should be asking for attention; the mark's position on the scale already says everything the number did.

THE STAGE AND THE GROUND
Size the stage to one viewport in svh, not a fixed measure in em and not vh — em leaves the fold landing wherever the root size happens to put it, and vh makes a phone's collapsing URL bar resize the whole composition mid-scroll. Keep a min-height so a short window does not crush the wordmark into the ridge.
Anchor the ridge to the stage's FOOT, not to a percentage part-way down it. The peaks are big shapes that hang well below their own box; floated at 72% they end wherever the fold happens to cut them, which reads as clipped artwork. Sitting on the bottom edge they come up out of it and the viewport cuts their bases, which is what a range on a horizon does anyway — no ground line needed, because the fold IS the ground. Keep them on a layer above the background frame so they cross its rules instead of stopping short of them.
Then take the ridge apart on the way out: a single 0-to-1 value over the first half-screen of scroll, written to the STAGE — not to :root, where a per-frame custom property write invalidates the whole document — with each peak given a resting offset and a direction to leave in, and the whole group fading as they go. The entrance animates the bottom offset, so drive the disassembly from the translate property and the two never contend for a channel.
Keep the background to the frame and the light. A drifting particle field and a ring of instrument circles both sound like they belong on a page like this, and both turn out to be noise once the frame is doing its job — the particles cost 22 frames a second on their own, and a circle sitting beside the wordmark competes with the one piece of type the page exists for.
