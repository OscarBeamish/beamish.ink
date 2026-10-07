# Examples

A plan, not a spec. Written for Oscar and for whoever builds this, and meant to
be argued with before anything is made.

## What an example is

A whole page that looks like a real brand site, built out of items from this
library and nothing else. Not a gallery of effects with labels on them: a page
that would pass as a studio's own site, where the effects are doing a job
rather than being exhibited.

The point is the thing a card cannot show. A card proves an effect loops; an
example proves it survives contact with a header, a paragraph of real copy, a
photograph and three other effects on the same page. Most of what is wrong with
an effect only appears there.

Examples are **not pasteable items**. There is no prompt that gives somebody a
whole brand site. What each one carries instead is a manifest: which items it
uses, with links. The example is the argument for the items, and the items are
what gets copied.

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

So an example page needs something the library does not have yet: a broker that
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
example and the rest DOM, which is a real constraint on what these pages can
be, and worth knowing early.

## What the examples will expose

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

A fourth collection, `examples/`, beside `effects/`, `components/` and
`grids/`. Each example is a directory with its own page, its own copy, and a
`meta.json` listing the items it uses.

Routed at `/examples/<slug>`, with an index at `/examples`. The nav gains a
fourth link, which is as many as that bar will take.

Recorded like a grid: a slow scroll down the page and back, so the card has a
video. The scroll recorder already exists and the demo pages already answer
`renderAtTime` by scrolling, so this is a copy of a working pattern rather than
new tooling.

The manifest is the valuable part. Rendered on the page as "this page is made
of these eleven things", each linking to its item, it turns an example into a
route into the library rather than a dead end. It is also checkable: a test can
assert every slug in a manifest exists, so an example cannot quietly reference
an item that was renamed.

## Risks, in the order I would worry about them

1. **The context broker is the whole job.** If it is not good, the examples are
   either thin or broken. Build it first and on its own.
2. **An example is a lot of copy.** A convincing brand page needs real writing,
   and placeholder text will make the whole thing look like a template. This is
   the part most likely to be underestimated.
3. **Photographs.** Three examples at six pictures each is eighteen, and the
   shared folder is already 800kB for six. They will need to be smaller and
   probably fewer.
4. **Maintenance.** An example referencing eleven items breaks when any of them
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
