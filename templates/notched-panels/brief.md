<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Modelyard", an AI gateway that puts one endpoint in front of every model, in a bold cobalt-and-yellow poster style made of interlocking panels. Anton and Inter from Google Fonts, everything else inline, and no image files anywhere. Make the brand obviously fictional and say so in the footer.

THE NOTCH IS THE WHOLE SYSTEM
Every block is a large-radius panel whose corner is bitten into by its neighbour, and none of it uses clip-path or masks:
- A panel paints a square of the NEIGHBOUR's colour behind its own rounded corner — `position: absolute; width: 50%; height: 50%; bottom: -4px; right: -4px; z-index: -5` — so the radius reads as an inverse curve and the two blocks appear to interlock.
- Use it everywhere: the white logo block biting into the cobalt nav bar, the hero's footer row where a blue block, a mid-blue gap and a second blue block interlock across the bottom, and the catalogue cards where the price strip and the button cluster bite into each other.
- The trick only holds if the squares are coloured from the neighbour, so keep the palette to five values: #183fad cobalt, #4565bc mid, #abb9de pale, #e9ecf6 chip, #f1bf0a yellow, on #090909 ink.

THE CONTROLS ARE MOULDED, NOT FLAT
Every control wears one material, adapted from the Uiverse toggle by Pradeepsaranbishnoi. Six shadows in a fixed order do all of it:
`0 15px 25px -4px rgba(0,0,0,.5)` outer drop, `inset 0 -3px 4px -1px rgba(0,0,0,.2)` dark bottom lip, `0 -10px 15px -1px rgba(255,255,255,.6)` white glow above, `inset 0 3px 4px -1px rgba(255,255,255,.2)` lit top edge, `inset 0 0 5px 1px rgba(255,255,255,.8)` halo, and `inset 0 20px 30px 0 rgba(255,255,255,.2)` sheen across the upper half.
- Pressed swaps the stack: the sheen moves to the bottom, a dark inset lands on top, and a `filter: blur(0.5px)` plus a one-step-smaller label makes the surface look pushed into the page rather than recoloured. Transition on `cubic-bezier(0.23, 1, 0.32, 1)` over 300ms.
- Scale it down for small controls — an 8px drop on a 34px button, not 15px, or a chip floats like a 68px key.
- Keep the shapes: the capsule stays a capsule, the icon button stays a circle. The capsule also keeps its white knob, which still grows into a fill on hover (width and height, springy `linear()`, ~1.6s) — it just sits under the sheen now.
- The full-size version of the material is a 100px round toggle: a hidden checkbox, a 68.8px button, a 72px halo ring at 20% white behind it, and a label whose colour and size shift on `:active` and `:checked`.

SECTIONS
1. Nav: a white logo block with an inline-SVG mark, a cobalt bar with centred links, a burger under 768px, and a pill carrying a live count of what you have routed.
2. Header: a cobalt panel with the wordmark set in Anton at `clamp(56px, 15.4vw, 158px)` across the full width, then a mid-blue stage holding a yellow section label, a paragraph, and a pale stat card with a big number and three overlapping initial chips. Under it, the interlocking footer row: a pill on the left, two round arrows on the right.
3. In place of a product photo, an isometric rig: three slabs at `rotateX(58deg) rotateZ(-45deg)`, floating on staggered sine loops, labelled with the featured model's name, context and price. Rotate the label 45° inside the slab or it reads as a smear on that plane.
4. Catalogue: nine model cards. Each has a notched price strip (list price struck through, live price), two round pill buttons, a title bar, and — where the sketch had a photo — a "plate": a CSS grid of bars drawn from that model's benchmark numbers, coloured per model. Meta line underneath carries context window and p50 latency.
5. Routing policy console: a cobalt panel holding four of the 100px toggles — cheapest, fastest, top eval, failover — over a readout that rewrites one sentence and a blended $/1M rate as you press them. Derive the rate from the catalogue table, not a constant, and route only over the chat-capable models: the embedding and safety endpoints are cheaper and faster than everything else, so without that filter they win every policy and the number never moves.
6. Tiers: three notched panels, the middle one cobalt, each closing on a moulded pill. Pressing one writes the choice into the sign-up note below.
7. FAQ: rows that open on a max-height transition, with the round moulded control as the +/− marker.
8. Sign-up: a pale panel with an inset-shadowed pill input and a moulded submit that validates natively and sends nothing.
9. Footer: cobalt panel, centred links, social icons, and a line saying every number on the page is synthetic.

BEHAVIOUR
- The arrows walk a featured model through the header: label, copy, the stat number and all three slab labels change together.
- The card's plus button toggles into a check, marks the card as routed and increments the count in the nav; pressing again removes it.
- Keep every number in one table at the top of the script and draw the price, the plate and the meta from it, so adding a model is one object.

RESPONSIVE
One column of cards under 480px, two to 768px, three above. The interlocking footer row collapses to just the pill under 640px, the isometric rig hides under 768px, and the nav links become a burger that reveals them inline.
