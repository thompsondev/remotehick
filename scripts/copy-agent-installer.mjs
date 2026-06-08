import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { loadEnv } from './lib/env-utils.mjs';

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
const excludedNames = new Set([
  'locales',
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
console.log(`Packaged slim agent (${sizeMb} MB) -> ${zipTarget}`);
