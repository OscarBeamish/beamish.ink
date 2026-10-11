# PointSwell, parked

Underscore-prefixed, so every scanner in the repo skips it: `pnpm generate`,
`pnpm build:items`, the site's catalogue loader and the registry test all
ignore a directory whose name starts with `_`. It is here rather than deleted
because the hard part is done and the remaining work is tuning.

## What is done

The contract problem is solved, and it was the reason to build it this way.
The scene it came from scrolls simplex noise forward with an accumulator,
which cannot loop and cannot be driven by `renderAtTime`. This is a sum of
travelling waves instead: every mode is a closed form in `t`, every omega is a
whole number of turns per period, so the sea returns exactly and seeking
backwards is free. Deep-water dispersion, a fanned set of headings, a jittered
grid rather than a reshaped sphere, additive points with no bloom pass.

## What is not

It looks wrong. At the current density and fade the sheet reads as a sparse
scatter rather than as a surface: too dim, too thin, and the crests do not
carry enough of the high colour to separate from the troughs. The numbers that
want work are `density`, `pointSize`, `opacity`, the two `smoothstep` ranges in
`vFade`, and the amplitude falloff `pow(0.82, fi)`, which is probably too steep
and is leaving the fine modes invisible.

No recipe.md, not in the DemoPanel registry, no media.

## To bring it back

Rename the directory to `point-swell`, write `recipe.md`, add the registry
line in `DemoPanel.astro`, then `pnpm generate` and `pnpm record`.
