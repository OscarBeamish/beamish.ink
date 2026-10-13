# Deploying to Cloudflare, with the domain at Namecheap

The site is static. Every page is built ahead of time, there is no server, and
nothing here needs a runtime. Cloudflare Pages is the right shape for it and the
free tier covers everything this will ever do.

Read the gotcha in step 4 before you start. It is the one that silently breaks
every prompt on the live site.

---

## 1. Push the repo to GitHub

Already done. `OscarBeamish/beamish.ink`, private, `main`.

```bash
git push origin main
git push --tags
```

`--tags` matters. The tags are what the prompts pin to, and a push without them
leaves the build resolving a commit SHA. See step 4.

Private is fine for now. Cloudflare builds a private repo without complaint, and
nothing about going live requires the source to be public yet.

## 2. Add the site to Cloudflare

You need a Cloudflare account. Free is fine.

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub, pick `OscarBeamish/beamish.ink`
3. Production branch: `main`

## 3. Build settings

| Field | Value |
| --- | --- |
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `site/dist` |
| Root directory | leave empty, it is the repo root |

`pnpm build` runs `pnpm generate` and then the Astro build, in that order. That
order is not optional: generate writes the prompts, the build resolves the pin
into them.

## 4. Environment variables

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22.14.0` |

That is the whole list. If `BEAMISH_PIN` is still set in the dashboard from an
earlier deploy, **delete it.** It overrides everything below and it is the
reason the site shipped nine broken prompts.

The tag every prompt points at now comes from the `version` field in
`package.json`, which is the only place that travels with the commit. The
earlier version ran `git describe --tags`, and Cloudflare shallow-clones without
tags, so that failed, the pin fell back to a commit SHA, and a hand-set variable
was the patch. A variable in a different system that a human has to remember to
change is not a fix, and it silently pinned the live site to a tag that was
missing more than half the library for a fortnight.

Nothing about that failure is visible on the site. The site never fetches those
URLs. Only a pasted prompt does, and then it 404s. `pnpm verify:pin` in step 8
is what actually checks.

`NODE_VERSION` is belt and braces: Cloudflare reads `.nvmrc`, which is already in
the repo, but the variable is what the dashboard shows you when something goes
wrong.

pnpm needs nothing. The `packageManager` field in `package.json` pins
`pnpm@10.29.2` and Cloudflare's build image honours it through corepack.

## 5. Deploy

Press **Save and Deploy**. The first build takes two or three minutes, mostly
installing three.js and Playwright.

You get a URL like `beamish-abc.pages.dev`. Check it works before touching DNS.
Specifically: open an item page, press **Copy prompt**, paste it somewhere, and
confirm the URLs say `v0.1.0` rather than a hash.

## 6. Move the domain to Cloudflare

Cloudflare wants the whole domain, not a single record. This is the part that
takes the longest in wall-clock time and the least in effort.

**In Cloudflare:**

1. **Websites** → **Add a site** → `beamish.ink`
2. Pick the **Free** plan
3. It scans your existing DNS and shows you two nameservers, something like
   `xavier.ns.cloudflare.com` and `nadia.ns.cloudflare.com`. They are assigned to
   your account, so copy the ones it actually gives you.

**In Namecheap:**

1. **Domain List** → **Manage** next to `beamish.ink`
2. **Nameservers** → change the dropdown from `Namecheap BasicDNS` to
   **`Custom DNS`**
3. Paste both Cloudflare nameservers, one per row
4. Tick the green check to save

Namecheap usually applies this within half an hour. Cloudflare emails you when it
has seen the change. It can take up to 24 hours and almost never does.

While you wait, nothing is broken. The domain keeps resolving wherever it points
now.

## 7. Point the domain at the site

Back in **Workers & Pages** → your project → **Custom domains**:

1. **Set up a custom domain** → `beamish.ink` → **Activate domain**
2. Do it again for `www.beamish.ink`

Cloudflare writes the DNS records itself and issues the certificate. HTTPS is
usually live within a minute or two.

Then decide which one is canonical. `beamish.ink` is already the canonical URL in
`site/astro.config.mjs`, so redirect the other one:

**Rules** → **Redirect Rules** → **Create rule**

- Name: `www to apex`
- If: **Hostname** **equals** `www.beamish.ink`
- Then: **Dynamic** redirect, **301**, expression:
  `concat("https://beamish.ink", http.request.uri.path)`

## 8. After every release

The pin is the one thing that does not update itself.

Bump `version` in `package.json` first. That number is the pin, so the commit
being tagged has to already name the tag it is about to get.

```bash
# 1. version, changelog, checks
#    package.json version -> 0.3.0, and CHANGELOG.md in the same commit
pnpm check                              # typecheck, generate:check, test, build, review
git commit -am "release: v0.3.0"

# 2. tag first, then the branch
git tag -a v0.3.0 -m "what changed"
git push origin v0.3.0
git push origin main

# 3. prove it
pnpm verify:pin
```

The tag goes up before `main` on purpose. Cloudflare starts building the moment
`main` moves, and if the tag is not there yet the build is racing it.

`pnpm verify:pin` fetches every file every prompt asks for, at the pin, and
fails on anything that is not a 200. Run it after the push. It is the only step
that checks the thing that actually breaks, and it would have caught both times
this went wrong.

There is no Cloudflare step. Nothing to remember, nothing to keep in sync.

Never delete or move a tag that has been published. Somebody has pasted it.

---

## Two things this setup deliberately does not do

**No Cloudflare Workers.** Cloudflare now pushes Workers with static assets over
Pages, and for an app that needs a runtime they are right. This has no runtime.
Pages is simpler, the Git integration is better, and there is nothing to gain.

**No media on a CDN of its own.** The videos are committed to the repo and served
from the same origin as the site, which is about 29MB of assets. Cloudflare
caches them at the edge for free. Revisit this if the repo passes 200MB, not
before.

## When something is wrong

**Build fails on `pnpm: not found`.** The `packageManager` field has been
removed from `package.json`. Put it back.

**Build fails on `.generated/index.json is missing`.** The build command is
running `astro build` directly instead of `pnpm build`. The generate step has to
run first.

**Prompts point at a SHA instead of a tag.** `package.json` has lost its
`version`, or a stale `BEAMISH_PIN` is still set in the dashboard and is
overriding it. Step 4. The build log says so.

**A pasted prompt 404s.** The tag does not contain those files, which means it
was cut before they existed. Run `pnpm verify:pin` to see exactly which, then
cut a new tag from a commit that has them. Never move the old one.

**Fonts look wrong on the live site but fine locally.** `site/public/fonts` is
gitignored, because it is a copy. `pnpm build` runs `sync-public.mjs` first,
which recreates it. If you changed the build command, that is why.

**Videos 404.** Same cause, same fix. `site/public/media` is a copy too.

---

## Appendix: the Playable Worlds mirror

`/playable-worlds` is a hidden page holding somebody else's work, mirrored so it
runs without a network. It is not part of the site above and it deploys by a
different route, for one reason: the mirror is 717MB and gitignored, so a
Cloudflare Git build clones the repo, finds no `games.json`, and ships the "not
on this machine" notice. Committing 717MB to fix that is not a trade worth
making.

So it goes up as a **direct upload to a Pages project of its own**, from the
machine that actually has the assets.

```bash
npx wrangler login      # once per machine
pnpm build              # the mirror is in site/public, so it lands in dist
pnpm worlds:deploy
```

`pnpm worlds:deploy` checks the build has the mirror in it, checks it fits
inside Cloudflare's limits, writes the noindex header and the root redirect,
creates the project if it is not there, and uploads. The project name is
`beamish-worlds-mirror`, overridable with `PW_PROJECT`.

### It still lives on beamish.ink

A project of its own is about where the bytes come from, not about the URL. The
domain is already on Cloudflare nameservers, so the project takes a subdomain
and Cloudflare writes the DNS itself:

**Workers & Pages** -> `beamish-worlds-mirror` -> **Custom domains** -> **Set
up a custom domain** -> `worlds.beamish.ink` -> **Activate domain**.

The certificate is usually live within a minute or two. The whole build goes
up, so the nav works and the effects library is there to show too, but the root
of that host redirects to `/playable-worlds`, so the URL to say out loud is the
bare subdomain.

### Why a project of its own

The beamish.ink project keeps building itself from `main` with nothing a
gigabyte in the way, and a project of its own can carry a blanket noindex,
which the real site must never have. A second copy of the site on a second
hostname would otherwise be duplicate content competing with the first; the
noindex is what makes that safe.

The one thing this shape does not give you is the exact path
`beamish.ink/playable-worlds`. Pages projects cannot share a hostname by path.
That would need a small Worker on a `beamish.ink/playable-worlds*` route
proxying to this project, which is a runtime, which is the one thing the main
deploy deliberately avoids.

### Keeping it out of Google

Three things, and the third is the one that actually does the work:

1. `<meta name="robots" content="noindex, nofollow">` on the page, from
   `noindex` on the Base layout.
2. `X-Robots-Tag: noindex, nofollow, noarchive` on every path, written into
   `dist/_headers` at deploy time. It is written into `dist` and never into
   `site/public`, because `site/public/_headers` is the real site.
3. Nothing anywhere links to it. No sitemap, no nav entry, no inbound link.
   A crawler has no route in.

**Not a `robots.txt` Disallow.** That is the instinct and it is the wrong one.
Disallow stops a crawler fetching the page, which also stops it reading the
noindex, so a URL somebody shares can still end up listed with no description.
Letting the crawler in and telling it noindex is the combination that keeps a
page out.

### Limits worth knowing before the upload starts

Cloudflare Pages caps a deployment at 20,000 files and 25MiB per file. The
build is about 2,600 files and the largest is a 21.7MB glb. It fits, with room,
and the script checks both before it starts rather than failing partway through
a gigabyte.

### Rebuilding the mirror

If `site/public/playable-worlds` is missing, `python
tools/playable-worlds/mirror.py` fetches it and
`tools/playable-worlds/vendor-stragglers.py` closes the last two remote
references. That needs a network. The result does not.
