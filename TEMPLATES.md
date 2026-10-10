# Templates

A plan, not a spec. Written for Oscar and for whoever builds this, and meant to
be argued with before anything is made.

## What a template is

A whole page that looks like a real brand site, built out of items from this
library and nothing else. Not a gallery of effects with labels on them: a page
that would pass as a studio's own site, where the effects are doing a job
rather than being exhibited.

The point is the thing a card cannot show. A card proves an effect loops; a
template proves it survives contact with a header, a paragraph of real copy, a
photograph and three other effects on the same page. Most of what is wrong with
an effect only appears there.

**Templates are pasteable.** This page used to say the opposite, on the grounds
that nobody pastes a brand site, and that was right while these were called
examples and their job was to prove the items worked. It stopped being right
the moment the job changed. Each one now ships a prompt that fetches the page's
four files and every library file it is built from, and the manifest it carries
is read out of `meta.json` by both the prompt and the page's own colophon, so
the two cannot disagree.

## What a template owes

An example owed proof. A template owes a page somebody would want to take, and
that is a higher bar in one specific way rather than in general.

The first two templates were built to the old bar and it showed. Measured
against the single-file landing pages this collection is competing with:

| | declaration blocks |
| --- | --- |
| Quoin & Rule, as an example | 27 |
| Coil & Bias, as an example | 34 |
| a reference landing page | 581 |
| another | 1023 |

The section counts were comparable. The craft was not. A band that is a
heading, a paragraph and a library item is a wireframe with an effect in it,
and five of those in a row is a wireframe with five effects in it.

So, for anything added here:

1. **One idea, carried.** Not a theme, a mechanism: a contact sheet, a forme in
   a chase, a front panel. It has to appear in at least four different places
   doing four different jobs, or it is a motif rather than an idea.
2. **The page brings its own craft.** Every ambient item in this library is
   required to survive being ignored, so a page that leans on items for its
   interest inherits their restraint. The items cannot carry a page and are not
   meant to.
3. **Display type at display size.** The reference pages set hero numerals at
   160px and section titles above 100. Timid type is the fastest way to look
   like a demo.
4. **Items serve the idea.** HalftoneReveal is the frame being printed, not
   HalftoneReveal being demonstrated. If an item could be swapped for any other
   without the page caring, it is being exhibited.
5. **Say what is invented.** Every brand, figure and photograph credit, in the
   page and in the markup.

The three current templates sit at 64, 78 and 85 blocks. Better than 27, and
still well short of the reference. The gap now is density rather than idea.

## The brands are invented

Not Nike, and not anybody else real. Two reasons, and the first is the one that
matters: a real brand's logotype, colours, photography and copy are theirs, and
none of it can live in this repo. A page that is recognisably somebody's brand
with the names filed off is worse than one that is not, because it looks like
it was taken.

The second reason is that it would be worse work. An invented brand can be
chosen to exercise the library: a brand that needs a dark ground, a brand whose
whole identity is a grid, a brand that wants type doing something. A real one
has its own requirements and we would end up fighting them.

Three proposed, each a different ground and a different part of the library.
Names are placeholders.

### 1. A letterpress studio, paper ground

The house style, pushed. Mostly type and grid: this is the one that proves the
library can make something quiet and expensive-looking.

Likely items: TwelveColumn, MarginaliaColumns, PaperGrain, RegistrationMarks,
MaskedHeading, SplitFountainText, EmbossedText, VariableWeightText,
WatermarkSheet, CardStack.

Needs about one canvas backdrop in total. Easy on the budget.

### 2. An electronics brand, dark ground

The opposite end, and the reason the `ground: dark` items exist. Three items
are dark-only today and fourteen are `either`, so this page is also a test of
whether `either` is true.

Likely items: AuroraCurtain, DustMotes, LightShafts, PrismSpectrum,
TerrainRelief, GlassNav, SpotlightCard, CountUpNumber, OdometerNumber.

This is the heavy one. Four or five of those hold a context.

### 3. A photographic agency, full bleed

Pictures and structure, almost no ornament. The page that proves the grids are
real.

Likely items: FullBleedTiles, ExpandingTiles, OverlapGrid, MasonryColumns,
HalftoneReveal, ScrollSlideshow, CrosshairCursor, ImageGalleryLightbox.

## The problem to solve first

**One live WebGL context at a time.** Twenty-eight of the fifty-eight items
hold one, and all seventeen backdrops do. A page that wants a backdrop in the
hero, a different one behind the middle band and a third at the outro is asking
for three, which is exactly what AGENTS.md forbids and what the browser will
punish.

So a template page needs something the library does not have yet: a broker that
keeps one context alive and hands it to whichever section owns the viewport,
mounting and destroying as the page scrolls. Every item already has
`destroy()`, and the context-leak test already proves fifty mount and destroy
cycles are clean, so the parts exist. What does not exist is the thing that
decides.

That broker is the first piece of work and it is shared infrastructure, not
page furniture. It probably belongs in `shared/`, next to the runtime, and it
probably wants its own test: mount three sections, scroll through them twice,
assert the live context count never exceeded one.

If that cannot be made to feel good, the fallback is one canvas effect per
template and the rest DOM, which is a real constraint on what these pages can
be, and worth knowing early.

## What the templates will expose

Things a brand page needs that the library has no item for. Some of these
become items; some stay page furniture.

- **A site header that is not GlassNav.** One nav for a whole library is thin.
- **A footer.** Nobody has built one. Every real site has one.
- **A product or project card** that is not a demo card.
- **A marquee of logos or clients.** ScrollMarquee is close but is about scroll.
- **A form.** A contact form with a field, a button and a validation state.
  Nothing in the library touches input at all, which is a gap worth noticing.
- **Page-to-page transition.** ExpandingTiles does one case of this. A real
  site wants a general one, and that is a genuinely hard item.
- **A cookie or consent strip.** Unglamorous, on every site, and absent here.

I would not build these up front. Build a page, find out which are actually
needed, then decide which deserve to be items.

## How it is built

A fourth collection, `templates/`, beside `effects/`, `components/` and
`grids/`. Each template is a directory with its own page, its own copy, and a
`meta.json` listing the items it uses.

Routed at `/templates/<slug>`, with an index at `/templates`. The nav gains a
fourth link, which is as many as that bar will take.

Recorded like a grid: a slow scroll down the page and back, so the card has a
video. The scroll recorder already exists and the demo pages already answer
`renderAtTime` by scrolling, so this is a copy of a working pattern rather than
new tooling.

The manifest is the valuable part. Rendered on the page as "this page is made
of these eleven things", each linking to its item, it turns a template into a
route into the library rather than a dead end. It is also checkable: a test can
assert every slug in a manifest exists, so a template cannot quietly reference
an item that was renamed.

## Risks, in the order I would worry about them

1. **The context broker is the whole job.** If it is not good, the templates are
   either thin or broken. Build it first and on its own.
2. **A template is a lot of copy.** A convincing brand page needs real writing,
   and placeholder text will make the whole thing look like a template. This is
   the part most likely to be underestimated.
3. **Photographs.** Three templates at six pictures each is eighteen, and the
   shared folder is already 800kB for six. They will need to be smaller and
   probably fewer.
4. **Maintenance.** A template referencing eleven items breaks when any of them
   is renamed. The manifest test is what stops that being discovered by a
   reader.
5. **Scope.** Each of these is a day's work done properly. Three is a week. One
   done well is worth more than three done quickly, and the first one will
   teach us what the other two should be.

## What I would do first

1. Build the context broker, with its test. Nothing else is blocked on anything
   else, and everything is blocked on this.
2. Build the letterpress studio, because it is the lightest on the budget and
   so tests the composition rather than the plumbing.
3. See what it needed that did not exist, and decide which of those are items.
4. Then the dark one, which is the real test of the broker.
