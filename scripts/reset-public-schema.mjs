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

console.log('Dropping public schema and recreating (wipes all tables)...');
await client.query('DROP SCHEMA public CASCADE');
await client.query('CREATE SCHEMA public');
await client.query('GRANT ALL ON SCHEMA public TO public');
try {
  await client.query('GRANT ALL ON SCHEMA public TO neondb_owner');
} catch {
  /* role name may differ */
}

const tables = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
`);
console.log('Tables after reset:', tables.rows.length);
await client.end();
console.log('Schema reset complete.');
