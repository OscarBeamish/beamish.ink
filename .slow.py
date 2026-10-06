import json, re, io

PLAN = {
  # slug: (period, fps, crf, new period description)
  'cast-shadow-scene': (40, 12, 30,
    'Seconds for one full circuit of the sun. Slow on purpose: this is meant to sit behind a heading, and the thing that pulls a reader off a headline is movement in the corner of their eye, so the shadows should creep rather than sweep. Below about 15 it reads as a time-lapse.'),
  'guilloche-lines': (36, 15, 40,
    'Seconds for one turn of the gears. The pattern is exactly periodic over this. Slow on purpose: a backdrop whose cycle you can follow is a backdrop competing with the page, and at a turn every few seconds the eye starts tracking the rosette instead of reading.'),
  'halftone-backdrop': (30, 15, 32,
    'Seconds for one full loop. The animation is exactly periodic over this. Slow on purpose: the plates should drift apart over half a minute, which reads as a press settling rather than as something happening.'),
  'marbled-paper': (48, 15, 36,
    'Seconds for one pass of the comb. Both combs run whole multiples of the same angle, so the pattern returns to exactly where it started and the loop is seamless. Slow on purpose: a comb you can watch crossing the tray is the loudest thing on the page.'),
  'stipple-field': (36, 15, 34,
    'Seconds for one loop of the drift. The tone field travels a closed circle through noise space, so it returns to exactly where it began and the loop is seamless. Slow on purpose: the marks should seem to be settling rather than moving.'),
  'terrain-relief': (36, 12, 29,
    'Seconds for one loop of the morph. The land travels a closed orbit through noise space and returns exactly. Slow on purpose: ground that visibly moves behind a heading is the fastest way to lose a reader.'),
  'translucent-sheets': (36, 15, 34,
    'Seconds for one loop of the drift. Every sheet travels a closed circle, so the pile returns to exactly where it started and the loop is seamless. Slow on purpose: sheets that settle over half a minute read as paper, and sheets that cross the frame in ten seconds read as an animation.'),
  'watermark-sheet': (40, 15, 32,
    'Seconds for one slow tilt against the light. Nothing moves on the sheet; the sheet moves. A closed orbit, so it returns to exactly where it began, and slow enough that nobody catches it at it.')
}

for slug, (period, fps, crf, desc) in PLAN.items():
    mp = f'effects/{slug}/meta.json'
    m = json.load(io.open(mp, encoding='utf-8'))
    m['options']['period']['default'] = period
    m['options']['period']['description'] = desc
    if m['options']['period'].get('max', 0) < period:
        m['options']['period']['max'] = max(period * 4, 180)
    m['record']['duration'] = period
    m['record']['fps'] = fps
    m['record']['crf'] = crf
    io.open(mp, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')

    cp = f'effects/{slug}/core.ts'
    core = io.open(cp, encoding='utf-8').read()
    mm = re.search(r'^export const \w+Defaults: [^=]+= \{\n(.*?)^\}$', core, re.M | re.S)
    block = mm.group(1)
    block = re.sub(r'^(  period: )(.+?)(,?)$', lambda x: x.group(1) + str(period) + x.group(3), block, count=1, flags=re.M)
    core = core[:mm.start(1)] + block + core[mm.end(1):]
    io.open(cp, 'w', encoding='utf-8', newline='\n').write(core)
    print(f'  {slug:22} period {period}s, record {period}s @ {fps}fps crf {crf}')
