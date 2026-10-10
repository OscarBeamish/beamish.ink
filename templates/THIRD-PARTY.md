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

| Template | Adapted from | Changed |
| --- | --- | --- |
| [`ingot`](./ingot/) | Machine Front Panel Page | Brand, copy and model numbers; palette moved from amber and cyan to sodium and ice; the engraved grey ramp and the rating plate's ink raised until every label passes WCAG AA |

## What was kept, and why it is worth saying

The layout, the structure and every drawn thing are the original author's, and
they are the reason these pages are here. On `ingot` that means the whole idea
that the page is the machine's front panel, the plate material, the generated
turbine, the trigonometric arc gauge, the single integrated load value that
drives the fan period and the lit ticks and the coil glow and all four
readouts, and every diagram on the page. None of that is ours and the header on
the file says so.

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

Any page that pulls a JavaScript library from a CDN is noted in the table above
when it is added. None do yet.
