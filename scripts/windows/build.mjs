// Builds the Windows one-click package: release/windows/Wendaflow/{Wendaflow.exe, dist/}.
// Works from Linux/macOS/Windows. Needs a Windows node.exe of the SAME version as the node running this script:
//   node scripts/windows/build.mjs --node-exe path/to/node.exe
import { rolldown } from 'rolldown';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync, cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const nodeExe = arg('--node-exe') || process.env.WENDAFLOW_WIN_NODE;
if (!nodeExe || !existsSync(nodeExe)) { console.error('Pass --node-exe <path to the Windows node.exe, same version as this node>'); process.exit(1); }
if (!existsSync(path.join(root, 'dist', 'index.html'))) { console.error('Run "npm run build" first (dist/ is missing).'); process.exit(1); }

const work = path.join(root, 'release', '.windows-build');
const out = path.join(root, 'release', 'windows', 'Wendaflow');
rmSync(work, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true });
mkdirSync(work, { recursive: true }); mkdirSync(out, { recursive: true });

const bundle = await rolldown({ input: path.join(root, 'scripts/windows/launcher.mjs'), platform: 'node' });
await bundle.write({ file: path.join(work, 'bundle.mjs'), format: 'esm', codeSplitting: false });
await bundle.close();

writeFileSync(path.join(work, 'sea-config.json'), JSON.stringify({ main: path.join(work, 'bundle.mjs'), mainFormat: 'module', output: path.join(work, 'sea.blob'), disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ['--experimental-sea-config', path.join(work, 'sea-config.json')], { stdio: 'inherit' });

const exe = path.join(out, 'Wendaflow.exe');
copyFileSync(nodeExe, exe);
execFileSync('npx', ['--yes', 'postject', exe, 'NODE_SEA_BLOB', path.join(work, 'sea.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });

cpSync(path.join(root, 'dist'), path.join(out, 'dist'), { recursive: true });
writeFileSync(path.join(out, 'README.txt'), 'Double-click Wendaflow.exe. The browser opens automatically.\r\nKeep the "dist" folder next to Wendaflow.exe.\r\nYour canvases are saved in %APPDATA%\\Wendaflow.\r\nClose the black window to quit.\r\n');
rmSync(work, { recursive: true, force: true });
console.log(`Done: ${out}`);
