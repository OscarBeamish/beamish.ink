# Third-party work in `templates/`

Some templates in this directory are not ours. They are adapted from the
one-shot HTML library at [instalanding.ai](https://instalanding.ai), used under
the MIT licence, and this file records which ones and what changed.

A template is one of two things, and its `meta.json` has to say which:

- **Built here.** It carries `uses`, the list of Beamish items it is composed
  from, and the page writes that list into its own colophon.
- **Adapted.** It carries `source`, naming the work, its author, its licence
  and what was changed. The schema rejects a template that declares neither,
  because the case that matters is an adapted page with no attribution: it
  would sit on the index looking like ours with somebody else's name nowhere
  on it.

Each adapted page also carries the full licence notice in a comment at the top
of its own `index.html`, which is where it has to be: the file travels on its
own, the prompt hands out that file, and a notice that lives only here would
not go with it.

## The licence

All adapted pages here are under the MIT licence.

```
Copyright (c) 2026 Ray Velez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Source: <https://github.com/RayVelez27/instalanding.ai>

## What was adapted

| Directory | Shown as | Adapted from | Changed |
| --- | --- | --- | --- |
| [`bedside`](./bedside/) | Bedside | SmartCare Clinical AI Landing Page | New brand, copy and figures, and a retuned palette |
| [`deadman`](./deadman/) | Deadman | Squircle Keycap Product Page | New brand, copy and figures, and a retuned palette |
| [`facet`](./facet/) | Facet | Generative Editorial Product Page | New brand, copy and figures, and a retuned palette |
| [`ingot`](./ingot/) | Ingot | Machine Front Panel Page | New brand, copy and model numbers, and a palette moved from amber and cyan to sodium and ice |
| [`leeward`](./leeward/) | Leeward | Wind Field Routing Page | New brand, copy and figures, and a retuned palette |
| [`loam`](./loam/) | Loam | Clay SaaS Platform Page | New brand, copy and figures, and a retuned palette |
| [`perigee`](./perigee/) | Perigee | Radiating Rings Hero Page | New brand, copy and figures, and a retuned palette |
| [`relay`](./relay/) | Relay | Icon-Cut Card Stack Page | New brand, copy and figures, and a retuned palette |
| [`switchyard`](./switchyard/) | Switchyard | Notched Panel Catalog Page | New brand, copy and figures, and a retuned palette |
| [`tooth`](./tooth/) | Tooth | Grain Motion System Page | New brand, copy and figures, and a retuned palette |

Every one of them also had its contrast retuned until it passes WCAG AA
at both widths, which is recorded per page rather than per template
because it was different work on each: on some it was one token, on
others it was an accent that had to be split in two because no single
value clears both a white ground and a dark panel.

## What was kept, and why it is worth saying

The layout, the structure and every drawn thing are the original author's, and
they are the reason these pages are here. Taking `ingot` as the example, that
means the whole idea that the page is the machine's front panel, the plate
material, the generated turbine, the trigonometric arc gauge, the single
integrated load value that drives the fan period and the lit ticks and the coil
glow and all four readouts, and every diagram on the page. The same is true of
the other nine in their own terms. None of it is ours, and the header on each
file says so.

What is ours is the brand, the words, the figures and the palette, plus the
accessibility work. That is a real but small part of each page and this file
exists so nobody has to guess which part.

## The brief

Each adapted template keeps the brief it was built from, as `brief.md` next to
its `index.html`. That document is the author's too, and it explains why the
page is built the way it is in a way that reading the markup does not.

It is called `brief.md` rather than `prompt.md` because `prompt.md` already
means something here: the Beamish prompt, generated into `.generated/<slug>/`.

## Dependencies

Adapted pages are self-contained apart from their fonts, which they load from
Google Fonts. The repo serves Archivo and JetBrains Mono from `shared/fonts.css`
and most of the library uses those, but the self-hosted subsets cover weights
400 to 700 and several of these pages set display type at 800 and 900. Pointing
them at the local file would silently clamp those weights and flatten every
heading, which is a worse trade than one request.

Three of them pull GSAP 3.12.5 and ScrollTrigger from cdnjs: `facet`, `leeward`
and `relay`. Their scroll animation is built on it and replacing that would not
be a small change. It means those three need the network, and GSAP's own
licence is worth checking before anything built on them is shipped publicly.
