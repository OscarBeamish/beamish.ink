You are adding a **404 page** to this project.

> The absence of a page, rendered at the address somebody asked for. Navigation · MIT.
> https://beamish.ink/404

There is nothing to fetch for this one. A 404 is three facts and a short list
of exits, and every project's are different, so what follows is the brief
rather than a file to copy. Write it in this project's own components, type and
voice.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None.
- A route or file the host serves for unmatched paths. On a static host that
  is usually a built `404.html`; on a server it is whatever handles the
  fallback.

## The status code is the item

This is the part that is actually broken on most sites, and it is invisible
from a browser.

A missing page must answer **404**, not 200. A page that looks like an error
and answers 200 is called a soft 404: every crawler is told the page exists,
so the dead URL stays in the index and keeps being served to people. Static
hosts are the usual culprit, because several of them fall back to
`index.html` for anything they cannot match, which hands the homepage out
under the wrong address with a 200 attached.

Check it rather than assume it:

```
curl -s -o /dev/null -w "%{http_code}\n" https://example.com/definitely-not-a-page
```

If that prints 200, nothing else on this page matters yet. Fix it first.

## Three facts and a way out

1. **Say what happened, in plain words, once.** "There is nothing at this
   address." Not "Oops!", not "Houston, we have a problem", and not a number
   on its own. The reader already knows something went wrong; what they do not
   know is whether it was their fault, whether the thing moved, or whether the
   site is broken.

2. **Say whether it ever existed, if you can tell.** This is the one thing
   almost nobody does and it is the most useful thing on the page. If the
   address matches something you removed or renamed, say so and say where it
   went. A changelog or a redirect table already has this; the 404 is just the
   place it finally gets read.

3. **Offer the nearest real things.** If the address looks like one of yours
   with a typo, match it and offer the close ones. Otherwise offer the two or
   three places somebody could plausibly have been heading. Put the site
   search here if there is one.

An illustration with a clever line and no exits is decoration rather than a
page. If you only do one thing from this list, do the third.

## Make it yours

The temptation is a joke, and a joke is fine as long as it is yours. Write it
in the voice the rest of the site is written in: a 404 that is suddenly
jocular on an otherwise sober site reads as a different site, and one that is
sober on a playful site reads as an outage.

Some devices are spent. A cartoon astronaut adrift, a dinosaur game, "lost in
space", a tilted road sign, a broken-robot illustration and a large faded
"404" behind centred text have all been done to the point of invisibility. If
you reach for one of those, you have decorated the page rather than designed
it.

The better move is to make the 404 do the thing the site is for. A drawing
tool's 404 is editable. A map's 404 is a map with a pin in the sea. A
catalogue's 404 is a catalogue entry for the page that is not there. Whatever
the site is good at, be good at it here too, because this is the one page
every reader arrives at already irritated.

## Do not

- Do not redirect to the homepage. The reader loses the address they typed and
  the evidence of what went wrong, and the dead link never gets reported.
- Do not auto-redirect on a timer. Somebody reading the page is reading it.
- Do not animate anything large. The reader is annoyed and in a hurry.
- Do not ask for an email address.

## Check it

- The status code is 404.
- The page works with no JavaScript, because a failing deploy is a common
  reason to be here at all.
- The links on it are not themselves broken, which happens more often than it
  should.
