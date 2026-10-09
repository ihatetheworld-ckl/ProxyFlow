"""Package the production extension and source using Python's standard library."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
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
assert 'update_url' not in manifest, 'Do not pretend a developer ZIP has an online update channel'
for path in dist.rglob('*.js'):
    assert not re.search(r'\beval\s*\(|\bnew\s+Function\s*\(', path.read_text()), path
def add(archive, path, name):
    assert not path.is_symlink(), f'Symlink cannot be packaged: {name}'
    assert path.resolve().is_relative_to(root.resolve()), name
    info = zipfile.ZipInfo(str(name).replace(os.sep, '/'), (2020, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

release = artifacts / f'proxyflow-{version}.zip'
source = artifacts / f'proxyflow-{version}-source.zip'
with zipfile.ZipFile(release, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(dist.rglob('*')):
        if path.is_file():
            add(archive, path, path.relative_to(dist))
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as archive:
    if (root / '.git').exists():
        names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
        paths = [root / name for name in sorted(filter(None, names))]
    else:
        paths = []
        for directory, dirs, files in os.walk(root):
            dirs[:] = sorted(d for d in dirs if d not in {'node_modules', '.git', 'artifacts', 'dist', '__pycache__'})
            paths.extend(Path(directory) / name for name in sorted(files))
    for path in paths:
        relative = path.relative_to(root)
        assert not any(part in {'node_modules', '.git', 'artifacts', 'dist'} for part in relative.parts), relative
        assert not path.name.startswith('.env') and path.suffix not in {'.pem', '.key'}, relative
        add(archive, path, Path('ProxyFlow') / relative)
for path in [release, source]:
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
    print(f'{path.name}: {path.stat().st_size} bytes')
sums = []
for path in sorted(artifacts.glob('*.zip')):
    sums.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name)
(artifacts / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
print('MV3 entries, permissions, runtime code scan, licenses and ZIP integrity passed.')
