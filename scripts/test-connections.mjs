import fs from 'fs';
import pg from 'pg';
import Redis from 'ioredis';

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

const env = loadEnv();

function redactUrl(url) {
  try {
    const u = new URL(
      url
        .replace(/^postgres:\/\//, 'http://')
        .replace(/^redis:\/\//, 'http://'),
    );
    return `${u.protocol}//${u.username ? '***:***@' : ''}${u.hostname}:${u.port || '(default)'}${u.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

console.log('--- Config (redacted) ---');
console.log('DATABASE_URL:', redactUrl(env.DATABASE_URL || ''));
console.log('REDIS_URL:', redactUrl(env.REDIS_URL || ''));

console.log('\n--- PostgreSQL ---');
if (!env.DATABASE_URL) {
  console.log('FAIL: DATABASE_URL not set');
} else {
  const variants = [
    ['current (.env)', env.DATABASE_URL],
    [
      'sslmode=disable',
      env.DATABASE_URL.replace(/\?.*$/, '') + '?sslmode=disable',
    ],
    ['no query string', env.DATABASE_URL.replace(/\?.*$/, '')],
  ];
  let connected = false;
  for (const [label, conn] of variants) {
    const client = new pg.Client({ connectionString: conn });
    try {
      await client.connect();
      const res = await client.query(
        'SELECT NOW() as now, current_database() as db',
      );
      console.log(`OK (${label}): Connected`);
      console.log('   database:', res.rows[0].db);
      console.log('   server time:', res.rows[0].now);
      await client.end();
      connected = true;
      break;
    } catch (e) {
      console.log(`FAIL (${label}):`, e.message);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  if (!connected) console.log('PostgreSQL: all connection attempts failed');
}

console.log('\n--- Redis ---');
if (!env.REDIS_URL) {
  console.log('FAIL: REDIS_URL not set');
} else {
  const redis = new Redis(env.REDIS_URL, {
    connectTimeout: 10000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    const pong = await redis.ping();
    console.log('OK: PING ->', pong);
    await redis.quit();
  } catch (e) {
    console.log('FAIL:', e.message);
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
  }
}
