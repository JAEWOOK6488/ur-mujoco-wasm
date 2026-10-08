"""Refresh the vendored, revision-pinned UR5e model (stdlib only)."""
import concurrent.futures, json, pathlib, re, urllib.request
REV = '0059d4335f8156206f63a35662313385f7ad6d74'
BASE = f'https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/{REV}/universal_robots_ur5e/'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'public/model'
def download(name):
    content = urllib.request.urlopen(BASE + name, timeout=60).read()
    dest = OUT / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return name
for name in ['ur5e.xml', 'LICENSE', 'README.md']:
    download(name)
assets = sorted(set(re.findall(r'<mesh file="([^"]+)"', (OUT/'ur5e.xml').read_text())))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    print(list(pool.map(download, ['assets/'+s for s in assets])))
(OUT/'assets.json').write_text(json.dumps(assets, indent=2)+'\n')
(OUT/'UPSTREAM').write_text(f'https://github.com/google-deepmind/mujoco_menagerie/tree/{REV}/universal_robots_ur5e\n')
