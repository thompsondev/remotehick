import fs from 'fs';
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

const client = new pg.Client({ connectionString: loadEnv().DATABASE_URL });
await client.connect();

const tables = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`);
console.log(
  'Public tables:',
  tables.rows.map((r) => r.table_name),
);

try {
  const migrations = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM _prisma_migrations
    ORDER BY finished_at
  `);
  console.log('Applied migrations:', migrations.rows);
} catch (e) {
  console.log('_prisma_migrations:', e.message);
}

await client.end();
