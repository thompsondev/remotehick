import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { v2 as cloudinary } from 'cloudinary';

const require = createRequire(import.meta.url);
const cloudinaryUploader = require('cloudinary/lib/uploader');

function loadEnv() {
  const text = fs.readFileSync('.env', 'utf8').replace(/^\uFEFF/, '');
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function upsertEnvValue(text, key, value) {
  const line = `${key}="${value}"`;
  const active = new RegExp(`^${key}=.*$`, 'm');
  const commented = new RegExp(`^#\\s*${key}=.*$`, 'm');

  if (active.test(text)) {
    return text.replace(active, line);
  }
  if (commented.test(text)) {
    return text.replace(commented, line);
  }
  return `${text.trimEnd()}\n${line}\n`;
}

function saveAgentConfigToEnv(partUrls) {
  const envPath = path.resolve('.env');
  let text = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  text = upsertEnvValue(text, 'CLOUDINARY_AGENT_PARTS', partUrls.join('|'));
  text = upsertEnvValue(text, 'CLOUDINARY_AGENT_RESOURCE_TYPE', 'raw');
  text = text.replace(/^CLOUDINARY_AGENT_URL=.*\n?/m, '');
  text = text.replace(/^#\s*CLOUDINARY_AGENT_URL=.*\n?/m, '');
  fs.writeFileSync(envPath, text, 'utf8');
}

function uploadPartBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    cloudinaryUploader.upload_stream((error, result) => {
      if (error) reject(error);
      else resolve(result);
    }, options).end(buffer);
  });
}

const env = { ...loadEnv(), ...process.env };
const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = env.CLOUDINARY_API_KEY?.trim();
const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
const publicIdBase =
  env.CLOUDINARY_AGENT_PUBLIC_ID?.trim() || 'remote-agent/Remote-Agent-win';

if (!cloudName || !apiKey || !apiSecret) {
  console.error(
    'Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env',
  );
  process.exit(1);
}

const filePath = path.resolve(
  env.AGENT_INSTALLER_PATH || 'public/agents/Remote-Agent-win.zip',
);

if (!fs.existsSync(filePath)) {
  console.error(`Installer not found at ${filePath}`);
  console.error('Build it first: cd ../remoteagent && pnpm dist');
  console.error('Then copy: pnpm copy:agent');
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

const totalSize = fs.statSync(filePath).size;
const sizeMb = (totalSize / (1024 * 1024)).toFixed(1);
const partSize = 9 * 1024 * 1024;
const partCount = Math.ceil(totalSize / partSize);

console.log(
  `Uploading ${sizeMb} MB to Cloudinary in ${partCount} parts (Free plan: <=10 MB each)...`,
);

const fd = fs.openSync(filePath, 'r');
const partUrls = [];

try {
  for (let index = 0; index < partCount; index += 1) {
    const offset = index * partSize;
    const length = Math.min(partSize, totalSize - offset);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, offset);

    const partPublicId = `${publicIdBase}-part-${String(index + 1).padStart(2, '0')}`;
    const result = await uploadPartBuffer(buffer, {
      resource_type: 'raw',
      public_id: partPublicId,
      overwrite: true,
    });

    partUrls.push(result.secure_url);
    const pct = Math.round(((index + 1) / partCount) * 100);
    process.stdout.write(`\rUploaded part ${index + 1}/${partCount} (${pct}%)`);
  }
} finally {
  fs.closeSync(fd);
}

process.stdout.write('\n');
saveAgentConfigToEnv(partUrls);

console.log('Uploaded to Cloudinary');
console.log(`parts: ${partUrls.length}`);
partUrls.forEach((url, index) => console.log(`  ${index + 1}. ${url}`));
console.log('Saved CLOUDINARY_AGENT_PARTS to .env');
