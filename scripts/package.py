"""Package the production extension and source using Python's standard library."""
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
artifacts = root / 'artifacts'
artifacts.mkdir(exist_ok=True)
version = json.loads((root / 'package.json').read_text())['version']
manifest = json.loads((dist / 'manifest.json').read_text())
assert manifest['version'] == version and manifest['manifest_version'] == 3
for name in [manifest['background']['service_worker'], manifest['action']['default_popup'],
             manifest['options_page'], *manifest['icons'].values(), 'LICENSE', 'THIRD_PARTY_NOTICES.txt']:
    assert (dist / name).is_file(), name
assert manifest.get('host_permissions', []) == []
assert set(manifest['permissions']) == {'proxy', 'storage', 'declarativeNetRequest', 'alarms'}
assert manifest.get('optional_permissions', []) == ['privacy']
for path in dist.rglob('*.js'):
    assert not re.search(r'\beval\s*\(|\bnew\s+Function\s*\(', path.read_text()), path
release = artifacts / f'proxyflow-{version}.zip'
source = artifacts / f'proxyflow-{version}-source.zip'
with zipfile.ZipFile(release, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(dist.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(dist))
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as archive:
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in {'node_modules', '.git', 'artifacts', 'dist', '__pycache__'})
        for name in sorted(files):
            path = Path(directory) / name
            archive.write(path, Path('ProxyFlow') / path.relative_to(root))
for path in [release, source]:
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
    print(f'{path.name}: {path.stat().st_size} bytes')
sums = []
for path in sorted(artifacts.glob('*.zip')):
    sums.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name)
(artifacts / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
print('MV3 entries, permissions, runtime code scan, licenses and ZIP integrity passed.')
