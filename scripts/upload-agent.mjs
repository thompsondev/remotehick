import { uploadAgentToCloudinary } from './upload-agent-cloudinary.mjs';
import { uploadAgentToGoogleDrive } from './upload-agent-drive.mjs';

async function main() {
  const variant = process.argv[2]?.trim()?.toLowerCase();

  try {
    if (variant === 'setup' || variant === 'portable' || variant === 'zip') {
      await uploadAgentToCloudinary({ variant });
      console.log(`\n${variant} agent hosting ready via Cloudinary.`);
      return;
    }

    await uploadAgentToCloudinary({ variant: 'setup' });
    console.log('\nSetup installer uploaded.');
    await uploadAgentToCloudinary({ variant: 'portable' });
    console.log('\nPortable installer uploaded.');
    await uploadAgentToCloudinary({ variant: 'zip' });
    console.log('\nZip installer uploaded.');
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
