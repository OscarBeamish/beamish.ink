<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "CRAFT®", an independent design studio in Milano. Use Inter Tight 400–900 from Google Fonts and Three.js 0.170 through an import map from jsDelivr. Everything else is inline.

DESIGN SYSTEM

- Swiss monochrome: paper #e9e9e7, card #f3f3f1, ink #111, mute rgba(17,17,17,.55), hairlines rgba(17,17,17,.14).
- The ONLY accent is a "prism" gradient (#ff3b3b → #ffb000 → #2fd27a → #1e90ff → #a24bff), echoing the glass knot's dispersion. Use it sparingly: key words, one ring, hover states.
- Type: 900-weight uppercase display at clamp(56px, 12vw, 220px) with -0.045em tracking and 0.84 leading; 600-weight statements; 12–13px uppercase labels at 0.04–0.06em tracking.
- Numbered section labels "(01) Studio"; hairline borders; cubic-bezier(.7,0,.2,1) everywhere.

HERO (WebGL)

- A fixed full-viewport canvas. The headline "DIGITAL / DESIGN / EXPERIENCE" is drawn into a 2D canvas as a CanvasTexture on a plane that exactly fills the view, each line scaled to 92% of the width. Keep the real <h1> screen-reader-only.
- In front floats a TorusKnot in MeshPhysicalMaterial: transmission 1, roughness 0, thickness 0.7, ior 1.45, dispersion 4, with a PMREM RoomEnvironment. It rotates over time and tilts toward the pointer.
- Wait for document.fonts.load('900 100px "Inter Tight"') before drawing; fonts.ready alone resolves instantly.
- Scrolling through the hero swells the knot toward the camera, adds rotation, and drifts and fades the type.
- Render only while the hero is visible (IntersectionObserver + setAnimationLoop).
- If WebGL fails, reveal an HTML fallback headline.
- Nav: white text with mix-blend-mode: difference, so it reads as ink on light sections and paper on dark ones. A "Milano — 2026 / Scroll to explore" meta bar with an animated drip line fades out on scroll.

SECTIONS (opaque, sliding up over the fixed scene like a curtain)

1. Studio: a large statement split into word spans that light up from 14% to full opacity as the paragraph scrolls through the viewport; key words in prism gradient text.
2. Capabilities: numbered rows (Brand Systems, Digital Product, Motion & 3D, Creative Dev) with huge uppercase titles. On hover an ink panel wipes up from the bottom, the text inverts, the title nudges right and the arrow rotates.
3. Selected work: an asymmetric 12-column grid of four projects with procedural CSS covers:
   - an outlined giant letter sized with container units, plus a spinning conic prism ring;
   - a dot grid with a matte sphere;
   - diagonal stripes with a wordmark band;
   - an orbit ring with a drifting prism orb.
     Covers zoom on hover, with hairline meta rows. A difference-blended custom cursor grows into a "VIEW" disc over projects and re-checks what's under it on scroll.
4. Numbers (dark section): four huge counters that ease up on view, a big client quote, and a marquee of client wordmarks in mixed weights.
5. Contact: "LET'S MAKE IT" display type, a large email link with a prism hover, and a brief form with underline fields, budget pills and a round 128px "Send brief" button that fills with the prism on hover. Validate inline and show a success message; send nothing.
6. Footer: address, a live Milano clock (Intl, Europe/Rome, with timeZoneName so it shows CET/CEST correctly), socials, back to top, and a viewport-wide CRAFT® wordmark.

RESPONSIVE + A11Y
At 900px grids collapse to one column and the services rows reflow. At 640px, 22px gutters and no horizontal overflow. Respect prefers-reduced-motion: static knot, no word dimming, no marquee.
