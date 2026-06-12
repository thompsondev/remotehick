import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { loadEnv } from './lib/env-utils.mjs';

const releaseDir = path.resolve('../remoteagent/release');
const agentRoot = path.resolve('../remoteagent');
const outDir = path.resolve('public/agents');

const SETUP_NAMES = ['Remote-Agent-Setup.exe', 'Remote Agent Setup 0.1.0.exe'];
const PORTABLE_NAMES = ['Remote-Agent-Portable.exe', 'Remote Agent 0.1.0.exe'];

/** Files/folders required for Electron to start without locale or runtime errors. */
const REQUIRED_PATHS = [
  'Remote Agent.exe',
  'icudtl.dat',
  'resources/app.asar',
  'locales/en-US.pak',
];

const README = `Remote Agent — Installation
============================

Recommended: run Remote-Agent-Setup.exe (one-click installer).

Portable: run Remote-Agent-Portable.exe (single file, no install wizard).

After install:
1. Open the enrollment link from your administrator again in your browser.
2. The agent enrolls automatically and runs in the system tray.

If Windows SmartScreen appears, click "More info" then "Run anyway".
The app is not code-signed yet.

Manual re-enroll: right-click the tray icon → Re-enroll
`;

function findReleaseFile(names, predicate) {
  for (const name of names) {
    const candidate = path.join(releaseDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return fs
    .readdirSync(releaseDir)
    .map((name) => path.join(releaseDir, name))
    .filter((filePath) => predicate(path.basename(filePath)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function writeAgentConfig() {
  execSync('node scripts/write-config.mjs', {
    cwd: agentRoot,
    stdio: 'inherit',
  });
}

function copyArtifact(source, targetName) {
  const target = path.join(outDir, targetName);
  fs.copyFileSync(source, target);
  const sizeMb = (fs.statSync(target).size / (1024 * 1024)).toFixed(1);
  console.log(`Copied ${path.basename(source)} -> ${target} (${sizeMb} MB)`);
  return target;
}

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

function packageZipFallback() {
  const unpackedDir = path.join(releaseDir, 'win-unpacked');
  if (!fs.existsSync(unpackedDir)) {
    console.error(
      'No installer or win-unpacked folder found. Run: cd ../remoteagent && pnpm dist',
    );
    process.exit(1);
  }

  const zipTarget = path.join(outDir, 'Remote-Agent-win.zip');
  const zipSource = path.resolve(unpackedDir);
  const excludedNames = new Set([
    'LICENSES.chromium.html',
    'vk_swiftshader.dll',
    'vk_swiftshader_icd.json',
  ]);

  if (process.platform === 'win32') {
    const stagingDir = path.join(
      os.tmpdir(),
      `remote-agent-slim-${Date.now()}`,
    );
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
    }
  }

  const sizeMb = (fs.statSync(zipTarget).size / (1024 * 1024)).toFixed(1);
  console.log(`Packaged zip fallback (${sizeMb} MB) -> ${zipTarget}`);
}

if (!fs.existsSync(releaseDir)) {
  console.error('No release folder found. Run: cd ../remoteagent && pnpm dist');
  process.exit(1);
}

writeAgentConfig();
fs.mkdirSync(outDir, { recursive: true });

const setupSource = findReleaseFile(
  SETUP_NAMES,
  (name) =>
    /setup/i.test(name) && /\.exe$/i.test(name) && !name.includes('unpacked'),
);
const portableSource = findReleaseFile(
  PORTABLE_NAMES,
  (name) =>
    /portable/i.test(name) &&
    /\.exe$/i.test(name) &&
    !name.includes('unpacked'),
);

let copied = 0;

if (setupSource) {
  copyArtifact(setupSource, 'Remote-Agent-Setup.exe');
  copied += 1;
}

if (portableSource) {
  copyArtifact(portableSource, 'Remote-Agent-Portable.exe');
  copied += 1;
}

if (copied === 0) {
  console.warn(
    'No .exe installers found in release/. Falling back to zip packaging.',
  );
  packageZipFallback();
} else {
  fs.writeFileSync(path.join(outDir, 'README.txt'), README, 'utf8');
  console.log(
    copied === 2
      ? 'Ready: Remote-Agent-Setup.exe (default download) + Remote-Agent-Portable.exe'
      : `Ready: ${copied} installer artifact copied`,
  );
}
