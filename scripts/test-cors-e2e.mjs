/**
 * End-to-end: admin login -> create instant link -> enroll-browser -> heartbeat with CORS.
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/v1`;
const ORIGIN = 'https://front.digitalcoresystem.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function jsonFetch(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Origin: ORIGIN,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function main() {
  console.log(`E2E instant-connect CORS test @ ${API}`);

  const login = await jsonFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!login.res.ok) {
    throw new Error(
      `Login failed (${login.res.status}): ${JSON.stringify(login.body)}`,
    );
  }
  const token = login.body?.token || login.body?.accessToken;
  if (!token) throw new Error('No access token in login response');

  const linkRes = await jsonFetch('/enrollment-links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ kind: 'INSTANT' }),
  });
  if (!linkRes.res.ok) {
    throw new Error(
      `Create link failed (${linkRes.res.status}): ${JSON.stringify(linkRes.body)}`,
    );
  }
  const code = linkRes.body?.code;
  if (!code) throw new Error('No enrollment code returned');

  const enroll = await jsonFetch('/devices/enroll-browser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      name: 'CORS Test Browser',
      hostname: 'browser',
      os: 'Web Browser',
      browser: 'Test',
    }),
  });
  if (!enroll.res.ok) {
    throw new Error(
      `enroll-browser failed (${enroll.res.status}): ${JSON.stringify(enroll.body)}`,
    );
  }

  const deviceId = enroll.body?.deviceId;
  const deviceToken = enroll.body?.deviceToken;
  if (typeof deviceId !== 'string' || !deviceId.trim()) {
    throw new Error(
      `enroll-browser missing deviceId: ${JSON.stringify(enroll.body)}`,
    );
  }
  if (typeof deviceToken !== 'string' || !deviceToken.trim()) {
    throw new Error(
      `enroll-browser missing deviceToken: ${JSON.stringify(enroll.body)}`,
    );
  }

  console.log(`Enrolled device ${deviceId}`);

  const heartbeat = await fetch(`${API}/devices/${deviceId}/heartbeat`, {
    method: 'PATCH',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'x-device-token': deviceToken,
    },
    body: JSON.stringify({}),
  });

  const allowOrigin = heartbeat.headers.get('access-control-allow-origin');
  const body = await heartbeat.json().catch(() => null);

  console.log(`Heartbeat status: ${heartbeat.status}`);
  console.log(`access-control-allow-origin: ${allowOrigin}`);
  console.log(`response: ${JSON.stringify(body)}`);

  if (!heartbeat.ok) {
    throw new Error(`Heartbeat failed with ${heartbeat.status}`);
  }
  if (allowOrigin !== ORIGIN) {
    throw new Error(`Missing/wrong CORS origin header: ${allowOrigin}`);
  }

  console.log(
    '\nE2E PASS — enroll + heartbeat with x-device-token and CORS headers.',
  );
}

main().catch((err) => {
  console.error('\nE2E FAIL:', err.message);
  process.exit(1);
});
