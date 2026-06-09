/**
 * Smoke QA for email notifications + v2 instant connect APIs.
 * Usage: node scripts/qa-smoke.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'http://localhost:3000/v1').replace(/\/$/, '');

const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    const msg = err?.message || String(err);
    results.push({ name, ok: false, detail: msg });
    console.log(`✗ ${name} — ${msg}`);
  }
}

async function json(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body };
}

async function main() {
  console.log(`QA smoke against ${BASE}\n`);

  await check(
    'GET /enrollment-links/:code/validate-connect exists',
    async () => {
      const { res, body } = await json(
        '/enrollment-links/smokeqa123/validate-connect',
      );
      if (
        res.status === 404 &&
        String(body?.message || '').includes('Cannot GET')
      ) {
        throw new Error('Route not deployed (404)');
      }
      if (!res.ok && res.status !== 200) {
        throw new Error(`HTTP ${res.status}`);
      }
      return `HTTP ${res.status}, valid=${body?.valid}`;
    },
  );

  await check('POST /devices/enroll-browser rejects invalid code', async () => {
    const { res, body } = await json('/devices/enroll-browser', {
      method: 'POST',
      body: JSON.stringify({ code: 'smokeqa_invalid_code' }),
    });
    if (res.status === 404) throw new Error('Route not deployed (404)');
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    return body?.message || 'bad request as expected';
  });

  await check(
    'POST /devices/enroll-browser rejects AGENT-only link kind',
    async () => {
      // Requires admin login to create link — skip if no creds
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      if (!email || !password) return 'skipped (no ADMIN_EMAIL/PASSWORD)';

      const login = await json('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!login.res.ok) throw new Error('Admin login failed');
      const token = login.body?.token;
      if (!token) throw new Error('No token from login');

      const link = await json('/enrollment-links', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: 'AGENT' }),
      });
      if (!link.res.ok) throw new Error('Failed to create AGENT link');
      const code = link.body?.code;
      if (!code) throw new Error('No code returned');

      const enroll = await json('/devices/enroll-browser', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      if (enroll.res.status !== 400) {
        throw new Error(
          `Expected 400 for AGENT link, got ${enroll.res.status}`,
        );
      }
      return 'correctly blocked';
    },
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
