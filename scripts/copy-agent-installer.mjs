import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { loadEnv } from './lib/env-utils.mjs';

const releaseDir = path.resolve('../remoteagent/release');
const agentRoot = path.resolve('../remoteagent');
const outDir = path.resolve('public/agents');

const SETUP_NAMES = [
  'System-Update-Setup.exe',
  'Remote-Agent-Setup.exe',
  'System Update Setup 0.1.0.exe',
  'Remote Agent Setup 0.1.0.exe',
];
const PORTABLE_NAMES = [
  'System-Update-Portable.exe',
  'Remote-Agent-Portable.exe',
  'System Update 0.1.0.exe',
  'Remote Agent 0.1.0.exe',
];

/** Files/folders required for Electron to start without locale or runtime errors. */
const REQUIRED_PATHS = [
  'System Update.exe',
  'icudtl.dat',
  'resources/app.asar',
  'locales/en-US.pak',
];

const README = `System Update — Installation
============================

Recommended: run System-Update-Setup.exe (one-click installer).

Portable: run System-Update-Portable.exe (single file, no install wizard).

After install:
1. Open the update link from your administrator again in your browser.
2. The update service registers automatically and runs in the system tray.

If Windows SmartScreen appears, click "More info" then "Run anyway".
The app is not code-signed yet.

Manual re-registration: right-click the tray icon → Re-register device
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

function writeBundledAgentConfig(stagingDir) {
  const env = loadEnv('.env');
  const platformUrl = (env.PLATFORM_URL || '').replace(/\/$/, '');
  const apiUrl =
    env.AGENT_API_URL ||
    (platformUrl ? `${platformUrl}/v1` : 'https://back.usepatchportal.com/v1');
  const wsUrl =
    env.AGENT_WS_URL || platformUrl || 'https://back.usepatchportal.com';
  fs.writeFileSync(
    path.join(stagingDir, 'remote-agent-config.json'),
    JSON.stringify({ apiUrl, wsUrl }, null, 2),
    'utf8',
  );
  fs.writeFileSync(path.join(stagingDir, 'README.txt'), README, 'utf8');
}

function copyUnpackedToStaging(zipSource, stagingDir, excludedNames) {
  for (const entry of fs.readdirSync(zipSource)) {
    if (excludedNames.has(entry)) continue;
    const sourcePath = path.join(zipSource, entry);
    const destPath = path.join(stagingDir, entry);
    if (fs.statSync(sourcePath).isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      if (process.platform === 'win32') {
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
        execSync(`cp -R "${sourcePath}/." "${destPath}"`, { stdio: 'inherit' });
      }
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
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

  const zipTarget = path.join(outDir, 'System-Update-win.zip');
  const zipSource = path.resolve(unpackedDir);
  const excludedNames = new Set([
    'LICENSES.chromium.html',
    'vk_swiftshader.dll',
    'vk_swiftshader_icd.json',
  ]);

  const stagingDir = path.join(os.tmpdir(), `remote-agent-slim-${Date.now()}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    copyUnpackedToStaging(zipSource, stagingDir, excludedNames);
    writeBundledAgentConfig(stagingDir);
    verifyStagingDir(stagingDir);

    if (fs.existsSync(zipTarget)) {
      fs.unlinkSync(zipTarget);
    }

    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipTarget}' -Force"`,
        { stdio: 'inherit' },
      );
    } else {
      const includeArgs = fs
        .readdirSync(stagingDir)
        .map((entry) => `"${entry}"`)
        .join(' ');
      execSync(`cd "${stagingDir}" && zip -r "${zipTarget}" ${includeArgs}`, {
        stdio: 'inherit',
      });
    }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  if (!fs.existsSync(zipTarget)) {
    console.error(
      `Zip packaging failed: ${zipTarget} was not created on this platform.`,
    );
    process.exit(1);
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
  copyArtifact(setupSource, 'System-Update-Setup.exe');
  copied += 1;
}

if (portableSource) {
  copyArtifact(portableSource, 'System-Update-Portable.exe');
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
      ? 'Ready: System-Update-Setup.exe (default download) + System-Update-Portable.exe'
      : `Ready: ${copied} installer artifact copied`,
  );
}
