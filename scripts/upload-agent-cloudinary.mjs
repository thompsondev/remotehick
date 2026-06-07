import fs from 'fs';
import { createRequire } from 'module';
import { v2 as cloudinary } from 'cloudinary';
import {
  getAgentInstallerPath,
  loadEnv,
  saveEnvValues,
} from './lib/env-utils.mjs';

const require = createRequire(import.meta.url);
const cloudinaryUploader = require('cloudinary/lib/uploader');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uploadPartBuffer(buffer, options, attempt = 1) {
  return new Promise((resolve, reject) => {
    cloudinaryUploader
      .upload_stream((result) => {
        if (result?.error) {
          const error = result.error;
          if (attempt < 5) {
            const delay = attempt * 3000;
            console.warn(
              `\nPart upload retry ${attempt}/4 in ${delay / 1000}s (${error.message || error})`,
            );
            sleep(delay)
              .then(() => uploadPartBuffer(buffer, options, attempt + 1))
              .then(resolve)
              .catch(reject);
            return;
          }
          reject(error);
          return;
        }
        resolve(result);
      }, options)
      .end(buffer);
  });
}

export async function uploadAgentToCloudinary(
  env = { ...loadEnv(), ...process.env },
) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  const publicIdBase =
    env.CLOUDINARY_AGENT_PUBLIC_ID?.trim() || 'remote-agent/Remote-Agent-win';

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env',
    );
  }

  const filePath = getAgentInstallerPath(env);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Installer not found at ${filePath}. Run pnpm copy:agent first.`,
    );
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
      process.stdout.write(
        `\rUploaded part ${index + 1}/${partCount} (${pct}%)`,
      );
    }
  } finally {
    fs.closeSync(fd);
  }

  process.stdout.write('\n');

  saveEnvValues({
    CLOUDINARY_AGENT_PARTS: partUrls.join('|'),
    CLOUDINARY_AGENT_RESOURCE_TYPE: 'raw',
    AGENT_DOWNLOAD_PROVIDER: 'cloudinary',
  });

  console.log('Uploaded to Cloudinary');
  console.log(`parts: ${partUrls.length}`);
  partUrls.forEach((url, index) => console.log(`  ${index + 1}. ${url}`));
  console.log('Saved CLOUDINARY_AGENT_PARTS to .env');

  return { partUrls };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  uploadAgentToCloudinary().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
