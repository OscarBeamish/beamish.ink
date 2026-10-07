You are adding **MarginaliaColumns** from Beamish to this project.

> A column of text with a narrow margin beside it, each note held level with the paragraph it belongs to. A grid system, CSS, MIT.
> https://beamish.ink/grids/marginalia-columns

Beamish is not a package and there is nothing to install from npm. This one is
a single stylesheet: put it in the project, link it, and use the class names.
There is no runtime, nothing to mount and nothing to destroy.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None.
- **Browser support:** CSS grid and custom properties. The nested-alignment
  helper uses subgrid; without it that one rule does nothing and the rest is
  unaffected.
- Every class carries a `g-` prefix. That is deliberate: `col-6` and
  `start-8` are Tailwind utilities, and `.band` and `.measure` are words a
  project may already be using.

- A note is a grid item in the same row as its paragraph, and that is the whole trick. Float it and it sits wherever the text happened to reach; position it absolutely and it holds still while the paragraph reflows to a different height, so the note explaining the third sentence ends up beside the fifth. As a grid row the pair cannot come apart, at any width, with no measurement and no script
- The note column is a fixed measure rather than a fraction. Two independent widths, not one width split two ways: the text keeps its measure and the note keeps its own short line
- The note aligns to the top of its row. Stretched or centred, a two-line note beside a nine-line paragraph sits halfway down and stops looking like an annotation of the first sentence, which is what it is
- The note must follow the element it annotates in the source. That is what makes it read correctly to a screen reader and what lets the narrow layout put it directly underneath
- Below 54rem it becomes one column with the note indented and ruled under its paragraph, so it still reads as an aside rather than as the next paragraph

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Save this file

Save it at `src/beamish/grids/marginalia-columns/grid.css`, or wherever this project keeps its CSS.

```css
/*
 * MarginaliaColumns: Beamish
 * https://beamish.ink/grids/marginalia-columns
 *
 * A column of text with a narrow margin beside it for notes, each note level
 * with the paragraph it belongs to. The layout of a scholarly edition, and of
 * most good documentation.
 *
 * Three things carry it, and the first is the one that breaks in every version
 * built with floats or absolute positioning.
 *
 * A note is a grid item in the same row as its paragraph. That is the whole
 * trick. Float it and it sits where the text happens to have reached; position
 * it absolutely and it holds still while the paragraph above it reflows to a
 * different height, so the note that explained the third sentence ends up
 * beside the fifth. As a grid row, the pair cannot come apart: the browser
 * keeps them level at every width, with no measurement and no script.
 *
 * The note column is a fixed measure, not a fraction. Give it `1fr` of
 * anything and the notes get wider as the window does, which is exactly
 * backwards: a note is a short aside and wants a short line, while the text
 * beside it has its own measure to keep. Two independent widths, not one split
 * two ways.
 *
 * And the note aligns to the top of its row, not the middle. `align-self:
 * start` is doing real work: stretched, a two-line note next to a nine-line
 * paragraph centres itself halfway down and stops looking like an annotation
 * of the first sentence, which is what it is.
 */

:root {
  /* The text column. Its own measure, independent of the note's. */
  --marg-measure: 34rem;
  /* The note column. A fixed width, because a note wants a short line. */
  --marg-note: 13rem;
  --marg-gutter: clamp(1.25rem, 3vw, 3rem);
  --marg-step: 1.5rem;
  --marg-rule: rgba(54, 54, 48, 0.2);
}

/*
 * Text, then note. `auto` on the first track rather than `1fr`, so the text
 * takes its measure and the pair sits together instead of being pushed apart
 * by a window that happens to be wide.
 */
.g-marg {
  display: grid;
  grid-template-columns: minmax(0, var(--marg-measure)) var(--marg-note);
  column-gap: var(--marg-gutter);
  row-gap: var(--marg-step);
  align-items: start;
  margin-inline: auto;
  width: fit-content;
  max-width: 100%;
  padding-inline: clamp(1rem, 4vw, 3rem);
  box-sizing: border-box;
}

/* Anything in the text column. Explicit, because source order alone would put
 * a second paragraph in the note column. */
.g-marg > :where(p, h1, h2, h3, ul, ol, blockquote, figure) {
  grid-column: 1;
  margin: 0;
}

/*
 * The note. Column two of its own row, aligned to the top of it.
 *
 * It must come immediately after the element it annotates in the source, which
 * is also what makes it read correctly to a screen reader and what lets the
 * narrow layout put it directly underneath.
 */
.g-note {
  grid-column: 2;
  align-self: start;
  margin: 0;
  font-size: 0.78em;
  line-height: 1.55;
  color: var(--label-3, #6b6b63);
}

/*
 * A note that should hang level with the previous paragraph rather than start
 * its own row. Grid puts each item in a new row by default, so a note placed
 * after a paragraph gets its own row and sits below it; this pulls it back up.
 */
.g-note--level {
  grid-row: auto / span 1;
  margin-top: calc(var(--marg-step) * -1);
}

/* A rule down the margin, between the text and its notes. */
.g-marg--ruled > .g-note {
  border-left: 1px solid var(--marg-rule);
  padding-left: calc(var(--marg-gutter) / 2);
  margin-left: calc(var(--marg-gutter) / -2);
}

/* Something that ignores the margin and runs the full width of both. */
.g-marg > .g-full {
  grid-column: 1 / -1;
}

.g-marg > .g-full img {
  display: block;
  width: 100%;
  height: auto;
}

/*
 * Narrow. One column, and the note falls directly under what it annotates,
 * which is why the source order matters. Indented and ruled so it still reads
 * as an aside rather than as the next paragraph.
 */
@media (max-width: 54rem) {
  .g-marg {
    grid-template-columns: minmax(0, 1fr);
    width: auto;
  }

  .g-marg > :where(p, h1, h2, h3, ul, ol, blockquote, figure),
  .g-note {
    grid-column: 1;
  }

  .g-note,
  .g-marg--ruled > .g-note {
    margin-top: 0;
    margin-left: 0;
    padding-left: 1rem;
    border-left: 2px solid var(--marg-rule);
  }
}
```

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--marg-measure` | `34rem` | The text column. Its own measure, independent of the note column, because the two are different kinds of reading and want different line lengths. |
| `--marg-note` | `13rem` | The note column, as a fixed width rather than a fraction. Give it a fraction and notes get wider as the window does, which is backwards: a note is a short aside and wants a short line. |
| `--marg-gutter` | `clamp(1.25rem, 3vw, 3rem)` | Between the text and its notes. Wide enough that a note reads as marginal rather than as a second column of equal standing. |
| `--marg-step` | `1.5rem` | The vertical gap between blocks. It is also what the level modifier cancels, so changing it keeps a levelled note aligned. |
| `--marg-rule` | `rgba(54, 54, 48, 0.2)` | The rule down the margin, used by the ruled modifier and by the narrow layout where the note sits under its paragraph. |

## 3. Wiring

```html
<link rel="stylesheet" href="./beamish/grids/marginalia-columns/grid.css" />

<article class="g-marg">
  <p>A paragraph that is being annotated.</p>
  <aside class="g-note g-note--level">The note about it.</aside>

  <p>A paragraph with no note.</p>

  <figure class="g-full"><img src="…" alt="…" /></figure>
</article>
```

`.g-marg` is the grid. Text elements go in column one automatically. `.g-note`
is a note, `.g-note--level` pulls it up level with the paragraph before it, and
`.g-full` runs across both columns.

**React, Vue, Astro.** Import the stylesheet once and use the class names.
There is no component to render.

## 4. Source order is load-bearing

A note must come immediately after the element it annotates. Three things
depend on it:

- a screen reader reads the note where it belongs rather than at the end,
- the narrow layout puts the note directly under its paragraph,
- `.g-note--level` pulls up by exactly one row gap, which only lands if the
  thing above is what you meant.

This is the one rule you cannot break and still have the layout mean anything.

## 5. Why there are two note classes

`.g-note` starts its own row, which is right for a note that belongs to a
section rather than to one paragraph.

`.g-note--level` cancels the row gap and sits level with the block before it,
which is right for an annotation of a particular sentence. It is a separate
class rather than the default because the pull is a negative margin, and a
negative margin applied where it was not wanted is harder to spot than one that
is missing.

## 6. Narrow widths

Below 54rem it becomes one column and the note falls directly under what it
annotates, indented and ruled so it still reads as an aside rather than as the
next paragraph.

There is no middle setting. A margin narrow enough to fit on a tablet beside a
readable text column holds about three words a line.

## 7. Common mistakes

1. **Floating the note.** It lands wherever the text reached, which is a
   different place at every width.

2. **Positioning the note absolutely.** It holds still while the text reflows,
   so it drifts away from the thing it explains, and only on some screens.

3. **Giving the note column a fraction.** The notes get longer lines as the
   window grows, which is the opposite of what a note wants.

4. **Stretching the note.** A short note beside a long paragraph centres itself
   and stops pointing at the first sentence.

5. **Putting the note before its paragraph.** It reads wrong aloud and lands in
   the wrong place when the layout collapses.
