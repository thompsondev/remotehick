import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { loadEnv } from './lib/env-utils.mjs';

const releaseDir = path.resolve('../remoteagent/release');
const outDir = path.resolve('public/agents');

/** Files/folders required for Electron to start without locale or runtime errors. */
const REQUIRED_PATHS = [
  'Remote Agent.exe',
  'icudtl.dat',
  'resources/app.asar',
  'locales/en-US.pak',
];

const README = `Remote Agent — Installation
============================

1. Extract this ENTIRE zip to a folder (e.g. C:\\RemoteAgent)
   Do NOT run Remote Agent.exe from inside the zip file.

2. Open the extracted folder and double-click "Remote Agent.exe"

3. When prompted, paste the enrollment code from your administrator.

4. Keep the app running in the system tray (near the clock).

If Windows SmartScreen appears, click "More info" then "Run anyway".
The app is not code-signed yet.

Support: your administrator can generate a new enrollment link if needed.
`;

function verifyStagingDir(stagingDir) {
  const missing = [];
  for (const relativePath of REQUIRED_PATHS) {
    const fullPath = path.join(stagingDir, ...relativePath.split('/'));
    if (!fs.existsSync(fullPath)) {
      missing.push(relativePath);
    }
  }

  const configPath = path.join(stagingDir, 'remote-agent-config.json');
  if (!fs.existsSync(configPath)) {
    missing.push('remote-agent-config.json');
  }

  if (missing.length) {
    throw new Error(
      `Agent package is incomplete. Missing: ${missing.join(', ')}. ` +
        'Rebuild with: cd ../remoteagent && pnpm dist && cd ../remotehick && pnpm copy:agent',
    );
  }
}

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
// Only exclude optional extras — keep locales/ and all runtime DLLs.
const excludedNames = new Set([
  'LICENSES.chromium.html',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
]);

if (process.platform === 'win32') {
  const stagingDir = path.join(os.tmpdir(), `remote-agent-slim-${Date.now()}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    for (const entry of fs.readdirSync(zipSource)) {
      if (excludedNames.has(entry)) continue;
      const sourcePath = path.join(zipSource, entry);
      const destPath = path.join(stagingDir, entry);
      if (fs.statSync(sourcePath).isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        try {
          execSync(
            `robocopy "${sourcePath}" "${destPath}" /E /NFL /NDL /NJH /NJS /nc /ns /np`,
            { stdio: 'inherit' },
          );
        } catch (error) {
          const code = error?.status;
          if (code == null || code > 7) {
            throw error;
          }
        }
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    const env = loadEnv('.env');
    const platformUrl = (env.PLATFORM_URL || '').replace(/\/$/, '');
    const apiUrl =
      env.AGENT_API_URL ||
      (platformUrl
        ? `${platformUrl}/v1`
        : 'https://dev.digitalcoresystem.com/v1');
    const wsUrl =
      env.AGENT_WS_URL || platformUrl || 'https://dev.digitalcoresystem.com';
    fs.writeFileSync(
      path.join(stagingDir, 'remote-agent-config.json'),
      JSON.stringify({ apiUrl, wsUrl }, null, 2),
      'utf8',
    );
    fs.writeFileSync(path.join(stagingDir, 'README.txt'), README, 'utf8');

    verifyStagingDir(stagingDir);

    if (fs.existsSync(zipTarget)) {
      fs.unlinkSync(zipTarget);
    }

    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipTarget}' -Force"`,
      { stdio: 'inherit' },
    );
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(path.join(outDir, '_win-unpacked-slim'), {
      recursive: true,
      force: true,
    });
  }
} else {
  const includeArgs = fs
    .readdirSync(zipSource)
    .filter((entry) => !excludedNames.has(entry))
    .map((entry) => `"${entry}"`)
    .join(' ');
  execSync(`cd "${zipSource}" && zip -r "${zipTarget}" ${includeArgs}`, {
    stdio: 'inherit',
  });
}

const sizeMb = (fs.statSync(zipTarget).size / (1024 * 1024)).toFixed(1);
console.log(`Packaged agent (${sizeMb} MB) -> ${zipTarget}`);
console.log('Verified: locales, icudtl.dat, remote-agent-config.json');
