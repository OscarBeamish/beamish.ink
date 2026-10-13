"""
Mirror Playable Worlds so it runs with no network at all.

Three things have to be pulled local, not just the pages:

  three.js, which every game imports from jsdelivr through an import map.
  Google Fonts, linked from the root page and from each game.
  Every asset each game names in its own inline script.

The last one cannot be discovered by following links, because the paths are
strings inside 85kB of inline JavaScript rather than src attributes. So each
game's HTML is fetched first and then scanned for anything that looks like a
path into its own assets folder.
"""

import io, json, os, re, sys, time
import urllib.request
import urllib.error

BASE = 'https://fal-video-to-game.vercel.app'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', 'site', 'public', 'playable-worlds')

UA = {
    # Google Fonts serves woff2 only to browsers that say they understand it.
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/125.0 Safari/537.36'
}

got, missed, bytes_in = [], [], 0


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save(rel, data):
    global bytes_in
    path = os.path.join(OUT, rel.replace('/', os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    bytes_in += len(data)


def grab(rel, url=None, quiet=False):
    """Fetch one path relative to the site root and keep it at the same path."""
    url = url or f'{BASE}/{rel}'
    path = os.path.join(OUT, rel.replace('/', os.sep))
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, 'rb').read()
    try:
        data = fetch(url)
    except Exception as e:
        missed.append((rel, str(e)[:70]))
        if not quiet:
            print(f'    MISS {rel}  {str(e)[:60]}')
        return None
    save(rel, data)
    got.append(rel)
    return data


def text(data):
    return data.decode('utf-8', 'replace') if data else ''


print('1. root page, shared script and styles')
root = grab('index.html')
if root is None:
    sys.exit('could not fetch the root page')
root_html = text(root)
grab('brand/gamepad.js')

# Anything the root page points at with src/href, other than fonts and videos.
for ref in sorted(set(re.findall(r'(?:src|href)="([^"]+)"', root_html))):
    if ref.startswith(('http', '//', '#', 'data:', 'mailto:')):
        continue
    if ref.endswith('.mp4') or '/index.html' in ref:
        continue
    grab(ref.lstrip('./'), quiet=True)

print('2. the manifest, which is what the page actually runs on')
# The root page is a 17kB shell that fetches games.json and builds itself from
# it. Scraping the rendered DOM, which is what the zip was, gets you the text
# and none of the paths. The manifest has every asset enumerated per game.
manifest = grab('games.json')
if manifest is None:
    sys.exit('no games.json, nothing to walk')
games = json.loads(text(manifest))
tags = [g['tag'] for g in games]
print(f'   {len(games)} games')

print('3. the game pages')
pages = {}
for tag in tags:
    data = grab(f'{tag}/index.html')
    if data:
        pages[tag] = text(data)
print(f'   {len(pages)} pages')

print('4. the videos')
for tag in tags:
    grab(f'videos/{tag}.mp4', quiet=True)
# A couple have a suffixed clip rather than a bare tag.
for extra in sorted(set(re.findall(r'"(videos/[^"]+\.mp4)"', root_html))):
    if '${' not in extra:
        grab(extra, quiet=True)

print('5. each game, assets from the manifest')
for g in games:
    tag = g['tag']
    want = []
    want += [x for x in g.get('images') or [] if isinstance(x, str)]
    want += [x for x in g.get('audios') or [] if isinstance(x, str)]
    want += [x['f'] for x in g.get('glbs') or [] if isinstance(x, dict) and 'f' in x]
    # Anything the page names that the manifest does not, such as atlas JSON.
    html = pages.get(tag, '')
    want += re.findall(r"""["'`]\.?/?(assets/[^"'`\s)]+)["'`]""", html)
    want = sorted({w for w in want if '${' not in w and not w.endswith('/')})
    n = sum(1 for w in want if grab(f'{tag}/{w}', quiet=True) is not None)
    print(f'   {tag}: {n}/{len(want)}')

print('6. vendoring three.js')
addons = set()
for html in pages.values():
    addons |= set(re.findall(r'three/addons/([^"\']+)', html))
print(f'   {len(addons)} addon modules referenced')

THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0'
grab('vendor/three/three.module.js', f'{THREE}/build/three.module.js')

# Addons import each other, so follow them until nothing new turns up.
queue, seen = list(addons), set()
while queue:
    mod = queue.pop()
    if mod in seen:
        continue
    seen.add(mod)
    data = grab(f'vendor/three/addons/{mod}', f'{THREE}/examples/jsm/{mod}', quiet=True)
    if not data:
        continue
    src = text(data)
    for rel in re.findall(r'from\s*[\'"](\.[^\'"]+)[\'"]', src):
        base = os.path.dirname(mod)
        joined = os.path.normpath(os.path.join(base, rel)).replace('\\', '/')
        if joined not in seen:
            queue.append(joined)
print(f'   {len(seen)} addon files pulled')

print('7. fonts')
font_css = sorted(set(re.findall(r'https://fonts\.googleapis\.com/css2\?[^"\']+', root_html)))
for html in pages.values():
    font_css += re.findall(r'https://fonts\.googleapis\.com/css2\?[^"\']+', html)
font_css = sorted(set(x.replace('&amp;', '&') for x in font_css))
print(f'   {len(font_css)} stylesheets')

sheets = {}
for i, url in enumerate(font_css):
    try:
        css = text(fetch(url))
    except Exception as e:
        missed.append((url, str(e)[:70]))
        continue
    for i2, file_url in enumerate(sorted(set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css)))):
        name = file_url.rsplit('/', 1)[-1].split('?')[0]
        if grab(f'vendor/fonts/{name}', file_url, quiet=True) is not None:
            css = css.replace(file_url, name)
    rel = f'vendor/fonts/sheet{i}.css'
    save(rel, css.encode('utf-8'))
    sheets[url] = rel
    got.append(rel)

print('8. rewriting pages to point at the local copies')


def localise(html, depth):
    up = '../' * depth
    html = html.replace(f'{THREE}/build/three.module.js', f'{up}vendor/three/three.module.js')
    html = html.replace(f'{THREE}/examples/jsm/', f'{up}vendor/three/addons/')
    for url, rel in sheets.items():
        html = html.replace(url, f'{up}{rel}')
        html = html.replace(url.replace('&', '&amp;'), f'{up}{rel}')
    # Preconnects to Google are harmless but slow the page down when offline.
    html = re.sub(r'<link[^>]+rel="preconnect"[^>]*fonts\.g[^>]*>', '', html)
    return html


save('index.html', localise(root_html, 0).encode('utf-8'))
for tag, html in pages.items():
    save(f'{tag}/index.html', localise(html, 1).encode('utf-8'))

print()
print(f'done: {len(got)} files, {bytes_in / 1024 / 1024:.1f} MB into {OUT}')
if missed:
    print(f'{len(missed)} misses:')
    for rel, why in missed[:25]:
        print(f'   {rel}  {why}')
