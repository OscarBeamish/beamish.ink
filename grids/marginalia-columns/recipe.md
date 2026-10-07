## What it is

MarginaliaColumns is a column of text with a narrow margin beside it for notes,
each note level with the paragraph it belongs to. The layout of a scholarly
edition, and of most good documentation.

It is CSS. There is no runtime, nothing to mount and nothing to destroy.

Three things carry it, and the first breaks in every version built with floats
or absolute positioning.

**A note is a grid item in the same row as its paragraph.** That is the whole
trick. Float it and it sits wherever the text happened to reach. Position it
absolutely and it holds still while the paragraph above reflows to a different
height, so the note explaining the third sentence ends up beside the fifth. As
a grid row the pair cannot come apart, at any width, with no measurement and no
script.

**The note column is a fixed measure, not a fraction.** Give it `1fr` of
anything and the notes get wider as the window does, which is exactly
backwards: a note is a short aside and wants a short line, while the text has
its own measure to keep. Two independent widths, not one width split two ways.

**The note aligns to the top of its row.** `align-self: start` is doing real
work. Stretched, a two-line note beside a nine-line paragraph centres itself
halfway down and stops looking like an annotation of the first sentence, which
is what it is.

## Wiring

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

## Source order is load-bearing

A note must come immediately after the element it annotates. Three things
depend on it:

- a screen reader reads the note where it belongs rather than at the end,
- the narrow layout puts the note directly under its paragraph,
- `.g-note--level` pulls up by exactly one row gap, which only lands if the
  thing above is what you meant.

This is the one rule you cannot break and still have the layout mean anything.

## Why there are two note classes

`.g-note` starts its own row, which is right for a note that belongs to a
section rather than to one paragraph.

`.g-note--level` cancels the row gap and sits level with the block before it,
which is right for an annotation of a particular sentence. It is a separate
class rather than the default because the pull is a negative margin, and a
negative margin applied where it was not wanted is harder to spot than one that
is missing.

## Narrow widths

Below 54rem it becomes one column and the note falls directly under what it
annotates, indented and ruled so it still reads as an aside rather than as the
next paragraph.

There is no middle setting. A margin narrow enough to fit on a tablet beside a
readable text column holds about three words a line.

## Common mistakes

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
