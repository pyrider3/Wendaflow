import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractFile } from '@electron/asar';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const output = pkg.build.directories.output;
const archive = path.join(output, 'linux-unpacked/resources/app.asar');
const html = extractFile(archive, 'dist/index.html').toString();
const asset = html.match(/src="([^"]+\.js)"/)[1].replace(/^\.\//, '');
for (const file of ['dist/index.html', `dist/${asset}`, 'electron-main.mjs', 'electron-preload.cjs',
  'LICENSE']) {
  assert.ok(extractFile(archive, file).equals(fs.readFileSync(file)), `Packaged content mismatch: ${file}`);
}
const cssAsset = html.match(/href="([^"]+\.css)"/)[1].replace(/^\.\//, '');
const css = extractFile(archive, `dist/${cssAsset}`);
assert.ok(css.equals(fs.readFileSync(`dist/${cssAsset}`)), 'Packaged stylesheet mismatch');
assert.ok(css.toString().includes('contrast-black'), 'Black theme styles missing');
const js = extractFile(archive, `dist/${asset}`).toString();
assert.ok(js.includes('contrast-black'), 'Black theme option missing');
assert.ok(js.includes('starlight') && css.toString().includes('--dark-control'), 'Star theme or readable dark controls missing');
assert.ok(!js.includes('graph-surface'), 'Removed node graph leaked into release');
assert.ok(!js.includes('graph-mode'), 'Removed node graph mode leaked into release');
assert.ok(js.includes('quick-thought-toggle') && js.includes('quick-thought-editor'), 'Quick thinking controls missing');
assert.ok(js.includes('quick-slice-trail') && js.includes('data-slice-target'), 'Right-drag slice gesture missing');
assert.ok(js.includes('quick-switch-track') && js.includes('aria-checked'), 'Quick thinking switch missing');
assert.ok(js.includes('http://127.0.0.1:4318'), 'Production proxy origin missing');
assert.ok(!js.includes('http://127.0.0.1:4319'), 'Test proxy leaked into release');
assert.ok(fs.readFileSync(path.join(output, 'linux-unpacked/resources/server.mjs')).equals(fs.readFileSync('server.mjs')));
const packedPackage = JSON.parse(extractFile(archive, 'package.json').toString());
assert.equal(packedPackage.version, pkg.version);
assert.equal(packedPackage.license, 'AGPL-3.0-only');
const records = [];
for (const name of [`Wendaflow-${pkg.version}.AppImage`, `wendaflow_${pkg.version}_amd64.deb`]) {
  const file = path.join(output, name), data = fs.readFileSync(file);
  assert.ok(data.length > 50_000_000, `Incomplete installer: ${file}`);
  assert.ok(name.endsWith('.deb') ? data.subarray(0, 8).equals(Buffer.from('!<arch>\n')) : data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), `Invalid header: ${file}`);
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  records.push(`${sha256}  ${name}`);
  console.log(JSON.stringify({ file, bytes: data.length, sha256 }));
}
fs.writeFileSync(path.join(output, 'SHA256SUMS-linux.txt'), records.join('\n') + '\n');
console.log('Linux packages match current source, conversation cards, proxy and license.');
