"""
Close the last two holes in the offline mirror.

The sweep for remote URLs found two things the first pass missed, which is
exactly why it is worth running: the root page loads Google's model-viewer for
the 3D asset previews, and one game out of twenty-six is pinned to a different
version of three. A mirror that assumes one version is a mirror with one broken
game in it.
"""

import io, os, re
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', 'site', 'public', 'playable-worlds')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/125.0 Safari/537.36'}


def fetch(url, timeout=90):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def save(rel, data):
    path = os.path.join(OUT, rel.replace('/', os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(data)


def grab(rel, url):
    path = os.path.join(OUT, rel.replace('/', os.sep))
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, 'rb').read()
    try:
        data = fetch(url)
    except Exception as e:
        print(f'   MISS {rel}  {str(e)[:60]}')
        return None
    save(rel, data)
    return data


def read(rel):
    return io.open(os.path.join(OUT, rel.replace('/', os.sep)), encoding='utf-8',
                   errors='replace').read()


def vendor_three(version, pages):
    """Pull one version of three plus every addon the given pages reach."""
    base = f'https://cdn.jsdelivr.net/npm/three@{version}'
    root = f'vendor/three-{version}'
    grab(f'{root}/three.module.js', f'{base}/build/three.module.js')
    queue = []
    for rel in pages:
        queue += re.findall(r'three/addons/([^"\']+)', read(rel))
    seen = set()
    while queue:
        mod = queue.pop()
        if mod in seen:
            continue
        seen.add(mod)
        data = grab(f'{root}/addons/{mod}', f'{base}/examples/jsm/{mod}')
        if not data:
            continue
        src = data.decode('utf-8', 'replace')
        for rel in re.findall(r'from\s*[\'"](\.[^\'"]+)[\'"]', src):
            joined = os.path.normpath(os.path.join(os.path.dirname(mod), rel)).replace('\\', '/')
            if joined not in seen:
                queue.append(joined)
    print(f'   three@{version}: {len(seen)} addon files')
    return base, root


print('1. the game pinned to a different three')
odd = 'S22_TRAIN-PAINTER/index.html'
base, root = vendor_three('0.170.0', [odd])
html = read(odd)
html = html.replace(f'{base}/build/three.module.js', f'../{root}/three.module.js')
html = html.replace(f'{base}/examples/jsm/', f'../{root}/addons/')
save(odd, html.encode('utf-8'))

print('2. model-viewer, for the 3D asset previews on the root page')
MV = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js'
data = grab('vendor/model-viewer.min.js', MV)
if data:
    # It pulls its own chunks in at runtime, so those have to come too.
    src = data.decode('utf-8', 'replace')
    chunks = set(re.findall(r'["\'](\./[A-Za-z0-9_.-]+\.js)["\']', src))
    for c in sorted(chunks):
        name = c.lstrip('./')
        grab(f'vendor/{name}',
             f'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/{name}')
    if chunks:
        print(f'   {len(chunks)} model-viewer chunks')
    root_html = read('index.html').replace(MV, 'vendor/model-viewer.min.js')
    save('index.html', root_html.encode('utf-8'))

print('3. sweeping for anything still remote')
left = []
for dirpath, _, files in os.walk(OUT):
    for name in files:
        if not name.endswith(('.html', '.css', '.js', '.json')):
            continue
        full = os.path.join(dirpath, name)
        try:
            body = io.open(full, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        hits = re.findall(r'https://(?:cdn\.jsdelivr|fonts\.googleapis|fonts\.gstatic|unpkg)[^"\')\s]*', body)
        if hits:
            left.append((os.path.relpath(full, OUT), sorted(set(hits))[:3]))
if left:
    print(f'   {len(left)} file(s) still reference a remote host:')
    for rel, hits in left[:12]:
        print(f'     {rel}')
        for h in hits:
            print(f'        {h[:95]}')
else:
    print('   nothing left: the mirror is self-contained')
