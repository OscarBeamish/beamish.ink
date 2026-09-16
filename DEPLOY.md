# Deploying to Cloudflare, with the domain at Namecheap

The site is static. Every page is built ahead of time, there is no server, and
nothing here needs a runtime. Cloudflare Pages is the right shape for it and the
free tier covers everything this will ever do.

Read the gotcha in step 4 before you start. It is the one that silently breaks
every prompt on the live site.

---

## 1. Push the repo to GitHub

Cloudflare builds from a repository, so this has to exist first.

```bash
gh repo create oscarbeamish/beamish --private --source=. --remote=origin
git push -u origin main
git push --tags
```

`--tags` matters. The tags are what the prompts pin to.

Keep it private for now. Cloudflare can build a private repo, and nothing about
going live requires the source to be public yet.

## 2. Add the site to Cloudflare

You need a Cloudflare account. Free is fine.

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub, pick `oscarbeamish/beamish`
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

This is the step that matters.

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22.14.0` |
| `BEAMISH_PIN` | `v0.1.0` |

**`BEAMISH_PIN` is the one that silently breaks things.** The site resolves the
tag every prompt points at by running `git describe --tags --abbrev=0`.
Cloudflare does a shallow clone without tags, so that command fails, the code
falls back to the commit SHA, and every prompt on the live site ends up pinned to
a forty-character hash instead of `v0.1.0`.

Nothing errors. The URLs still work. They are just ugly and they change on every
deploy, which defeats the point of pinning at all.

Set it by hand, and **update it every time you cut a tag.** There is a check for
this in step 8.

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

```bash
pnpm check          # typecheck, generate:check, test, build, review
git tag -a v0.2.0 -m "what changed"
git push --tags
```

Then in Cloudflare, **Settings** → **Environment variables**, change
`BEAMISH_PIN` to `v0.2.0` and redeploy.

Do not skip this. A tag without the variable means the new work is live and every
prompt still points at the old one. Nothing will tell you.

Update `CHANGELOG.md` in the same commit as the tag, and never delete or move a
tag that has been published. Somebody has pasted it.

---

## Two things this setup deliberately does not do

**No Cloudflare Workers.** Cloudflare now pushes Workers with static assets over
Pages, and for an app that needs a runtime they are right. This has no runtime.
Pages is simpler, the Git integration is better, and there is nothing to gain.

**No media on a CDN of its own.** The videos are committed to the repo and served
from the same origin as the site, which is about 18MB of assets. Cloudflare
caches them at the edge for free. Revisit this if the repo passes 200MB, not
before.

## When something is wrong

**Build fails on `pnpm: not found`** — the `packageManager` field has been
removed from `package.json`. Put it back.

**Build fails on `.generated/index.json is missing`** — the build command is
running `astro build` directly instead of `pnpm build`. The generate step has to
run first.

**Prompts point at a SHA instead of a tag** — `BEAMISH_PIN` is unset or stale.
Step 4.

**Fonts look wrong on the live site but fine locally** — `site/public/fonts` is
gitignored, because it is a copy. `pnpm build` runs `sync-public.mjs` first,
which recreates it. If you changed the build command, that is why.

**Videos 404** — same cause, same fix. `site/public/media` is a copy too.
