import { spawnSync } from 'node:child_process';

const MIGRATE_ATTEMPTS = 5;
const MIGRATE_RETRY_MS = 8_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with code ${result.status}`,
    );
  }
}

async function migrateWithRetry() {
  const migrateEnv = {
    ...process.env,
    DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
  };

  for (let attempt = 1; attempt <= MIGRATE_ATTEMPTS; attempt += 1) {
    const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: migrateEnv,
    });

    if (result.status === 0) {
      console.log('Database migrations applied.');
      return;
    }

    if (attempt === MIGRATE_ATTEMPTS) {
      throw new Error('prisma migrate deploy failed after multiple attempts');
    }

    console.warn(
      `Migration attempt ${attempt}/${MIGRATE_ATTEMPTS} failed — retrying in ${MIGRATE_RETRY_MS / 1000}s...`,
    );
    await sleep(MIGRATE_RETRY_MS);
  }
}

await migrateWithRetry();
run('node', ['dist/src/main']);
