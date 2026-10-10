You are building **MachinePanel** from Beamish into this project.

> An invented on-premise inference appliance, where the page is the machine's front panel. A whole page, MIT.
> https://beamish.ink/templates/machine-panel

This is a page, not a component. It is one HTML file, one stylesheet and one
entry script, built out of 0 pieces of the library, and the
brand on it is invented so that you can throw it away. Take the layout and the
wiring; replace the words, the colours and the pictures with the real ones.

Beamish is not a package and there is nothing to install from npm.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None.
- **Ground:** this page is built for a dark background. Its items are tuned for a near-black page; on paper it will look wrong.
- **One WebGL context.** Several of these items each want one, and the budget
  is one for the whole page, so the stage hands it between them as you scroll.
  That is already wired; do not mount two backdrops without it.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch the page

| Save as | Fetch from |
| --- | --- |
| `index.html` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/machine-panel/index.html |
| `entry.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/machine-panel/entry.ts |
| `meta.json` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/machine-panel/meta.json |

Everything this page draws with is inside `index.html`: its CSS, its SVG
and its script are all in the one file. `entry.ts` adds nothing you will see;
it exposes the handle a recording is driven with, and you can drop it.

## 2. Where this page came from

This one is not ours. It is adapted from **Machine Front Panel Page** by
Ray Velez, used under the MIT licence:

https://github.com/RayVelez27/instalanding.ai

New brand, copy and model numbers, and a palette moved from amber and cyan to sodium and ice.

The licence notice is in the comment at the top of `index.html` and it has to
travel with the file. Keep it there when you edit the page, and keep it there
if you ship it.

| Item | Save as | Fetch from |
| --- | --- | --- |
| shared | `templates/_shared/scroll-driver.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/_shared/scroll-driver.ts |

## 3. Make it yours

The brand is invented. There is no such company, the copy is written for this
page and every figure on it is made up, so none of it is precious. The licence
is the one thing on the page that is not yours to change.

- Replace the words first. The layout was built around real sentences rather
  than lorem, which is why it holds, and it will hold around yours.
- Every tone on the page derives from a handful of custom properties at the top
  of the `<style>` block. Retune those rather than hunting hex values, and
  check the result: small labels on a dark panel fail a contrast threshold long
  before they look wrong.
- Nothing here is a photograph. Every mark on the page is CSS or inline SVG, so
  there are no assets to swap and nothing to license but the page itself.
- Keep the licence comment at the top of the file, and keep the line that says
  the brand is fictional.
- Keep the reduced-motion handling. WCAG 2.2.2 is Level A, and this page
  already does the work.
