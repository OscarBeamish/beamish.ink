You are adding **MisprintText** from Beamish to this project.

> A printing plate slipping out of register, so the word prints twice in two inks. Type · effect · MIT.
> https://beamish.ink/effects/misprint-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. Three stacked copies of the text, moved with transforms
- The offset plates use mix-blend-mode: multiply, because overlapping ink is darker than either colour. A channel split goes brighter where the channels meet, which is light rather than ink
- The in-register plate stays in normal flow and is the one that can be selected. The other two are aria-hidden and pointer-events: none
- Offsets are in em, so one setting works at every type size
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/misprint-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/misprint-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A printing plate slipping out of register, so the word prints twice in two inks.

The usual version of this splits the red and blue channels apart and calls it a
glitch. That is a television fault: an analogue signal arriving at the wrong
time. Paper has its own version of the same idea and it looks quite different. A
press lays one plate per ink, and if a plate is a fraction out of position its
colour prints beside the others rather than on top of them.

So this is three copies of the same text, two of them coloured and offset, and
the stack **multiplies** rather than composites, because that is what overlapping
ink does. The overlap going darker is the whole tell. A channel split goes
brighter where the channels meet, which is light, not ink, and it is the thing
that makes the usual version read as a screen rather than as a page.

Registration does not drift, either. A plate sits wrong for a whole run and then
gets knocked, so the offset holds still and then jumps. Easing it would turn a
press into a wobble, and a wobble is a very different and much less interesting
fault.

No canvas and no WebGL. Three stacked spans and two transforms per frame.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ink` | color | `#36362f` | any CSS hex | The plate that is in register. This is the one in normal flow and the one a mouse can select; the other two are decoration. |
| `accent` | color | `#c44400` | any CSS hex | The first plate that is not in register. |
| `second` | color | `#6f8fae` | any CSS hex | The second plate that is not. Two is what makes it read as a press rather than as a drop shadow. |
| `slip` | number | `0.045` | 0 to 0.3 | How far a plate slips, in em, so it tracks the type size rather than needing a different number at every heading level. Past about 0.12 the words separate and you are reading three of them. |
| `hold` | number | `1.4` | 0.1 to 10 | Seconds a plate holds its position before being knocked. Registration does not drift: a plate sits wrong for a whole run and then moves, so this is a step rather than a speed. |
| `chance` | number | `0.55` | 0 to 1 | Share of runs where the plates are actually out. A press that is always wrong is not a press that is nearly right, and at 1 the text never settles. |
| `skew` | number | `0.4` | 0 to 4 | How far a slipped plate also turns, in degrees. Small: a plate that is out by a whole degree is a plate that has fallen off. |
| `seed` | number | `7` | 0 to 999 | Which runs slip and how far. Change it for a different sequence; the same seed always gives the same one. |

## 5. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no WebGL context to release.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable, and this moves indefinitely. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

The jump rate is also worth a thought under WCAG 2.3.1, which is Level A and
allows at most three changes a second. The default `hold` of 1.4 seconds is well
inside that. If you drop it below about 0.34 you are in breach, so do not.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`, which defaults to 0.

Whether that frame is in or out of register depends on `seed`. If you want it
reliably settled for those readers, mount with `chance: 0` when
`matchMedia('(prefers-reduced-motion: reduce)')` matches: clean type is the
correct outcome and it costs nothing.

## 7. The three mistakes most likely to be made here

1. **Using it on a paragraph.** Three stacked copies of a block of body text is
   unreadable, and the offset is per-element rather than per-line so a wrapped
   paragraph moves as one slab. It is for a heading.

2. **Raising `chance` to 1.** The text never returns to register, so there is
   nothing to read the misprint against and it stops looking like an error. The
   effect lives in the contrast between right and nearly right.

3. **Picking two dark inks.** They multiply, so the overlap is darker than
   either. Two near-blacks give you a slightly blacker black and no visible
   separation. One of the three wants to be light.

4. **Expecting it to work on a background colour.** `mix-blend-mode: multiply`
   blends with whatever is painted behind, which is the point on paper and a
   problem over a photograph. On a busy background, put it on its own layer.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/misprint-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/misprint-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
