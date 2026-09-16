import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

await mkdir('build', { recursive: true });
await sharp('public/wonderful-mark.svg').resize(512, 512).png().toFile('build/icon.png');
const ico = await pngToIco('build/icon.png');
await writeFile('build/icon.ico', ico);

// iconutil is supplied by macOS. Keeping this generation here means a macOS
// release never ships the generic Electron icon, while Windows/Linux builds
// remain dependency-free.
if (process.argv.includes('--mac')) {
  if (process.platform !== 'darwin') throw new Error('macOS 图标只能在 macOS 上生成');
  const iconset = 'build/icon.iconset';
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp('public/wonderful-mark.svg').resize(size, size).png().toFile(`${iconset}/icon_${size}x${size}.png`);
    await sharp('public/wonderful-mark.svg').resize(size * 2, size * 2).png().toFile(`${iconset}/icon_${size}x${size}@2x.png`);
  }
  await execFileAsync('iconutil', ['-c', 'icns', iconset, '-o', 'build/icon.icns']);
  await rm(iconset, { recursive: true, force: true });
}
