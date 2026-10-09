"""Bundle real browser screenshots and review documents; does not publish to Web Store."""
from pathlib import Path
import hashlib
import json
import os
import struct
import zipfile

root = Path(__file__).resolve().parents[1]
artifacts = root / 'artifacts'
version = json.loads((root / 'package.json').read_text())['version']
report = json.loads((artifacts / 'browser-report.json').read_text())
assert report['verified'] is True and report['extensionVersion'] == version
if os.environ.get('GITHUB_SHA'):
    assert report['commit'] == os.environ['GITHUB_SHA'], 'Browser evidence must match this release commit'
files = [(artifacts / 'browser-report.json', 'browser-report.json')]
windows_path = artifacts / 'windows-evidence/browser-report.json'
windows = json.loads(windows_path.read_text())
assert windows['verified'] is True and windows['extensionVersion'] == version and windows['platform'] == 'win32'
assert windows['commit'] == report['commit'], 'Both platforms must verify the same release commit'
files.append((windows_path, 'windows-browser-report.json'))
assert report['platform'] == 'linux'
promo = artifacts / 'screenshots/promo-small.png'
data = promo.read_bytes()
assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == (440, 280)
files.append((promo, 'promotional/promo-small.png'))
for name in ['options-light.png', 'options-dark.png', 'import-dark.png', 'update-dark.png']:
    path = artifacts / 'screenshots' / name
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == (1280, 800), name
    files.append((path, 'screenshots/' + name))
for name in ['STORE.md', 'STORE-LISTING.md', 'PERMISSIONS.md', 'PRIVACY.md', 'UPDATES.md', 'TESTING.md', 'VERIFICATION.md']:
    files.append((root / 'docs' / name, 'docs/' + name))
files.append((root / 'public/icons/icon128.png', 'icons/icon128.png'))
package = artifacts / f'proxyflow-{version}-store-assets.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path, name in sorted(files, key=lambda pair: pair[1]):
        info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
sums = [hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name for path in sorted(artifacts.glob('*.zip'))]
(artifacts / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
print(f'{package.name}: real browser evidence, image dimensions and documents verified.')
