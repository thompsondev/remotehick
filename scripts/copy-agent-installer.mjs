import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const releaseDir = path.resolve('../remoteagent/release');
const outDir = path.resolve('public/agents');

if (!fs.existsSync(releaseDir)) {
  console.error('No release folder found. Run: cd ../remoteagent && pnpm dist');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const installerCandidates = fs
  .readdirSync(releaseDir)
  .filter((name) => /\.(exe|zip)$/i.test(name) && !name.includes('unpacked'))
  .map((name) => path.join(releaseDir, name));

if (installerCandidates.length > 0) {
  const source = installerCandidates.sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  )[0];
  const ext = path.extname(source).toLowerCase();
  const targetName =
    ext === '.zip' ? 'Remote-Agent-win.zip' : 'Remote-Agent-Portable.exe';
  const target = path.join(outDir, targetName);
  fs.copyFileSync(source, target);
  console.log(`Copied ${source} -> ${target}`);
  process.exit(0);
}

const unpackedDir = path.join(releaseDir, 'win-unpacked');
if (!fs.existsSync(unpackedDir)) {
  console.error(
    'No installer or win-unpacked folder found. Run: cd ../remoteagent && pnpm dist',
  );
  process.exit(1);
}

const zipTarget = path.join(outDir, 'Remote-Agent-win.zip');
if (fs.existsSync(zipTarget)) {
  fs.unlinkSync(zipTarget);
}

const zipSource = path.resolve(unpackedDir);
if (process.platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${zipSource}\\*' -DestinationPath '${zipTarget}' -Force"`,
    { stdio: 'inherit' },
  );
} else {
  execSync(`cd "${zipSource}" && zip -r "${zipTarget}" .`, {
    stdio: 'inherit',
  });
}

console.log(`Packaged ${unpackedDir} -> ${zipTarget}`);
