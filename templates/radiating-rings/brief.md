<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Proxima", a fictional inference edge network, where the hero is a wavefront: concentric stadium rings radiating out of the button, a streaked orb hanging over them, and glass readouts floating in the gaps. Poppins and JetBrains Mono from Google Fonts, everything else inline. No images and no libraries - the orb, the rings and the starfield are all CSS. Say in a legal line that the network and every figure are invented, and label the figures on the page as invented too.

THE RINGS
Five closed stadiums, every one centred on the button rather than anchored to the bottom, so the stack reads as a tunnel seen end-on instead of a set of arches. The outer is wide and flat - about 2.4 to 1 - and the next three step down uniformly at 86, 72 and 58 percent. The innermost breaks the pattern and goes flatter still, 50 by 40, so it hugs the button.
Fill each with a three-stop gradient running almost vertically, pale blue at the top through mid to deep navy at the foot, and give every one a 1px inset highlight on its top edge plus a soft outer glow so the bands separate without hard outlines.
Then lay a band of light across the middle of the stack: a wide flat radial in near-white, screen-blended, sitting slightly above centre and slightly left. That single element is what makes the rings read as lit from behind rather than as five stacked shapes.

THE LIGHT
No hard-edged sphere. The background is a wash: a large radial raked in from the top left over a diagonal gradient that falls to near-black at the bottom right. Add one soft rake of light off the top-left corner, but blur it far more than feels necessary - at 26px a rotated pill leaves a visible diagonal seam straight across the hero, and it needs to be nearer 96px to read as light rather than as a shape.

THE LIGHT TRACKS THE POINTER
The source carries a pointer listener called "tracking", and it is the thing that makes the hero feel alive: the light follows the cursor and the lit band on the rings follows with it.
Do it with transforms on two elements, not by animating gradient positions. Put the wash in its own element rather than in the section's background - moving a viewport-sized radial by editing its background-position repaints the whole hero on every frame, where a transform does not.
Move the band across the rings at about a third of the pointer's travel, so it stays on the stack instead of running off the ends, and leave a soft static wash underneath so the rings are never unlit. Lerp both toward the pointer and park the loop once they have caught up, rather than burning a frame a tick.
Rest it where the composition was authored - light up and to the left - so the page looks right before anyone touches it, on a phone, and under prefers-reduced-motion, where it is placed once and never tracks.

THE RINGS LIGHT WHEN YOU GO FOR THE BUTTON
The source has a listener per ring - box1 through box5 - and they are there so the stack illuminates when the pointer arrives. Hovering anywhere on the stack, the button included, lifts every ring to a brighter version of its own gradient.
Fade in a pseudo-element over each ring rather than filtering or re-shadowing the ring itself: opacity composites, and five stacked 1200px shapes re-filtering on hover does not.
Stagger it from the button outwards, and put the delay in the :hover rule rather than the base one - then the light ripples out on the way in and the whole stack drops together on the way out, which is what it should do. Measure it: at 70ms only the innermost should have moved.
Key it off :focus-within as well as :hover so it answers a keyboard too.

THE BEADS
A scatter of small circles, some solid blue and some just a ring, sitting ON the stack rather than behind it. Put them in their own layer inside the stack, above the rings and below the button: in the page's dust layer they disappear under the first band.

THE NAV
A pill nav with an indicator that slides between items. Measure it from the active link rather than hard-coding offsets, so it survives a font swap or a copy change, and re-measure on the font-ready promise and on resize. Let an IntersectionObserver hand the pill to whichever section is actually on screen.

THE REST
A starfield placed once from a seeded generator - nothing here needs to move to read as depth, and the hero already carries a 950px orb and five stacked stadiums. Then three feature cards whose badges are the ring motif at badge scale, a three-step list, four figures, a close and a footer.
