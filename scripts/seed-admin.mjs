import fs from 'fs';
import bcrypt from 'bcrypt';
import pg from 'pg';

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

const email = (
  process.env.ADMIN_EMAIL ||
  loadEnv().ADMIN_EMAIL ||
  'admin@example.com'
).toLowerCase();
const password =
  process.env.ADMIN_PASSWORD || loadEnv().ADMIN_PASSWORD || 'admin123';
const passwordHash = await bcrypt.hash(password, 10);

const client = new pg.Client({ connectionString: loadEnv().DATABASE_URL });
await client.connect();

const existing = await client.query(
  `SELECT id, email FROM "Admin" WHERE email = $1`,
  [email],
);
if (existing.rows.length > 0) {
  await client.query(`UPDATE "Admin" SET "passwordHash" = $1 WHERE id = $2`, [
    passwordHash,
    existing.rows[0].id,
  ]);
  console.log(`Admin password synced for ${email}`);
} else {
  const legacy = await client.query(`SELECT id FROM "Admin" WHERE email = $1`, [
    'admin@localhost',
  ]);
  if (legacy.rows.length > 0) {
    await client.query(
      `UPDATE "Admin" SET email = $1, "passwordHash" = $2 WHERE id = $3`,
      [email, passwordHash, legacy.rows[0].id],
    );
    console.log(`Admin migrated from admin@localhost to ${email}`);
  } else {
    const count = await client.query(
      `SELECT COUNT(*)::int AS count FROM "Admin"`,
    );
    if (count.rows[0].count === 0) {
      await client.query(
        `INSERT INTO "Admin" (id, email, "passwordHash", role, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'admin', NOW(), NOW())`,
        [email, passwordHash],
      );
      console.log(`Admin created: ${email}`);
    } else {
      console.log('Other admins exist; skipped bootstrap seed.');
    }
  }
}

await client.end();
