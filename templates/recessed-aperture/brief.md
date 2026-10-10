<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Mnemo", a fictional context layer for agents, where the hero is an aperture cut into the page. Barlow and Barlow Condensed from Google Fonts, everything else inline. No images at all - every disc, pill and badge is CSS. Say in a legal line that the product and every figure are invented, and label the figures on the page as invented too, not only in the footer.

THE MATERIAL: SOFT UI, DONE PROPERLY
One light source at the top left, and every raised or pressed surface is the SAME colour as the page. That rule is what the whole effect rests on - tint a surface away from its background and the shadows stop reading as relief and start reading as a drop shadow. Light mode does this with #FFF against #F0F0F3; the violet equivalent is a lighter and a darker violet either side of the page colour (#7f6b9b and #4d3e60 against #695681).
Put the relief on a pseudo-element behind the surface, not on the surface itself. One element can then carry an outer and an inner cast at once and cross-fade between them, which is the entire interaction language: press a card and its outer shadow fades out while its inner one fades in.
Two consequences to plan for. Anything using it needs its own stacking context - z-index 0 on the surface - or a z-index:-1 pseudo-element falls through its parent and lands behind whatever ancestor painted last. And never put overflow:hidden on one of these: it clips the cast and the element goes flat.
Build four named variants off the same pair - raised, pressed-lit-from-the-top-left, pressed-lit-from-the-bottom-right, and a shallow bead that is raised and pressed at once - and use them for everything: the aperture, the cards, the badge dots, the stat panels, the price wells, the switches, the slider track and the accordion rows.
The background must be flat. A gradient behind a flat-filled card turns every card into a lighter patch the further down the page you get, which is the one thing that gives the trick away.
Palette: coral #FB8A8A and cream #FFEDC0 for the marks, and two gradients - cream to peach, and indigo to orchid.

THE APERTURE
Two concentric wells sunk into the page, with a drift of rounded pills crossing them and the context size sitting in the hole.

THE PARALLAX
Six layers, each with a depth from 1.2 down to 0.1, translated against the pointer and lerped toward the target. Do not reach for a parallax library: it is one lerp and one transform per layer, and writing it out means you can stop the loop when the aperture scrolls away and park it once the layers have settled, which a drop-in will not do for you.
Watch what you keyframe. The entrance on the big number animates transform, and so does the parallax - but a filled animation outranks an inline style, so keyframing the layer itself leaves that one element the only thing in the scene that never moves. Parallax the layer, animate a child inside it.

THE TOKENS
Twelve pills, four per layer, sliding across and tapering on a thirteen second loop with staggered delays.
Make the field they live in wider than the viewport, not just wider than the aperture - 1800px against an 800px disc - and start a third of them off the edge so they bleed in. Sized to the disc they only ever orbit the hole and the page is bare either side of it; overrun the viewport and the hero fills right out past both edges. Place the outliers' delays between the others' so neither side band is ever empty at the same moment, and make the pills large: 170 to 380px wide, not 70 to 180.
Keep them out of the band the eyebrow sits in. Everything sweeps the full width, so a token cannot be kept off the copy by its x position - only by its row. The scrim under the copy is strongest at its middle and has already faded by the top, which is exactly where a 380px pill crossing the eyebrow will be least covered.
Animate left and width, not a transform. scaleX squashes the 80px radius into a lens and the pill stops being a pill, and on twelve small absolutely positioned elements the layout it would have saved measured at nothing.
Taper to a fixed width rather than a percentage of the field: at 1400px wide a tenth of it is 140px, which is larger than half the tokens start at, so they would swell on the way across instead of shrinking. On a phone the field is several times the screen width, so scale the field itself rather than re-sizing twelve pills and their positions by hand.

THE FIGURE
The context size, printed twice: once in white and once behind it in the shadow colour, blurred 10px at 80% opacity, so the front copy sits inside its own shadow. Punch it in from scale(10) with a skew.
Sit it in the upper half of the aperture and give the copy the lower half. Select it as .layer.figure, not .figure - the responsive rules retune .layer, and at equal specificity the later rule wins, which quietly hands the numeral back its centred position on a phone and drops it on the headline.
The copy sits where the drift is densest, so put a soft radial scrim behind it. The pills stay visible around the edges and the text stops fighting them.

BELOW THE FOLD
Three feature cards, a strip of four figures, a three-step pipeline whose step rules are the same token pill lying flat, a control panel, a pricing row, an accordion and a close.
The control panel is where this material earns its keep, because a control is the one thing it describes literally: a track is a well, a knob is a raised disc, a dial is a well with two more inside it. Make them work - the switches change the budget the slider sets, and the dial reports the result - so the panel is a working model rather than three pictures of controls. Scale the dial so it only touches its ceiling at the extreme; multiply a fraction by 100 and any pin at all pins it at 99. Keep the nav's underline trick: a 4px gradient bar that grows from left:100% to 40px wide on hover.
Under prefers-reduced-motion the aperture is already open, the pills are parked where they were authored rather than mid-drift, and the parallax never starts.
