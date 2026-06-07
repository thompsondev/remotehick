import fs from 'fs';
import { google } from 'googleapis';
import {
  getAgentInstallerPath,
  loadEnv,
  saveEnvValues,
} from './lib/env-utils.mjs';

export async function uploadAgentToGoogleDrive(
  env = { ...loadEnv(), ...process.env },
) {
  const clientEmail = env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')?.trim();
  const folderId = env.GOOGLE_DRIVE_AGENT_FOLDER_ID?.trim();

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing Google credentials. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env',
    );
  }

  const filePath = getAgentInstallerPath(env);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Installer not found at ${filePath}. Run pnpm copy:agent first.`,
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const sizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);
  console.log(`Uploading ${sizeMb} MB to Google Drive...`);

  const existingFileId = env.GOOGLE_DRIVE_AGENT_FILE_ID?.trim();
  let fileId = existingFileId;

  if (existingFileId) {
    await drive.files.update({
      fileId: existingFileId,
      media: {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
    });
    console.log(`Updated existing Drive file ${existingFileId}`);
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: 'Remote-Agent-win.zip',
        mimeType: 'application/zip',
        ...(folderId ? { parents: [folderId] } : {}),
      },
      media: {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
    });
    fileId = created.data.id;
    console.log(`Created Drive file ${fileId}`);
  }

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  saveEnvValues({
    GOOGLE_DRIVE_AGENT_FILE_ID: fileId,
    AGENT_DOWNLOAD_URL: downloadUrl,
    AGENT_DOWNLOAD_PROVIDER: 'google-drive',
  });

  console.log('Uploaded to Google Drive');
  console.log(`file_id: ${fileId}`);
  console.log(`download_url: ${downloadUrl}`);
  console.log(
    'Saved GOOGLE_DRIVE_AGENT_FILE_ID and AGENT_DOWNLOAD_URL to .env',
  );

  return { fileId, downloadUrl };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  uploadAgentToGoogleDrive().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
