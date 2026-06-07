import { uploadAgentToCloudinary } from './upload-agent-cloudinary.mjs';
import { uploadAgentToGoogleDrive } from './upload-agent-drive.mjs';

async function main() {
  try {
    await uploadAgentToCloudinary();
    console.log('\nAgent hosting ready via Cloudinary.');
    return;
  } catch (error) {
    console.error('\nCloudinary upload failed:', error?.message || error);
    console.error('Falling back to Google Drive...\n');
  }

  await uploadAgentToGoogleDrive();
  console.log('\nAgent hosting ready via Google Drive.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
