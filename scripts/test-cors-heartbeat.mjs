/**
 * Verifies CORS for instant-connect heartbeat (PATCH + x-device-token).
 * Usage: node scripts/test-cors-heartbeat.mjs [baseUrl]
 */

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/v1`;
const FRONT_ORIGIN = 'https://front.digitalcoresystem.com';
const BLOCKED_ORIGIN = 'https://evil.example.com';
const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const FAKE_TOKEN = 'test-device-token';

function headerGet(headers, name) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
}

async function testPreflight(origin, label) {
  const url = `${API}/devices/${DEVICE_ID}/heartbeat`;
  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type,x-device-token',
    },
  });

  const allowOrigin = headerGet(res.headers, 'access-control-allow-origin');
  const allowHeaders =
    headerGet(res.headers, 'access-control-allow-headers') || '';
  const allowMethods =
    headerGet(res.headers, 'access-control-allow-methods') || '';

  const headersOk = allowHeaders.toLowerCase().includes('x-device-token');
  const methodsOk = allowMethods.toUpperCase().includes('PATCH');
  const originOk = allowOrigin === origin;

  return {
    label,
    status: res.status,
    allowOrigin,
    allowHeaders,
    allowMethods,
    pass:
      origin === BLOCKED_ORIGIN
        ? !allowOrigin
        : originOk && headersOk && methodsOk,
  };
}

async function testPatch(origin, label) {
  const url = `${API}/devices/${DEVICE_ID}/heartbeat`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'x-device-token': FAKE_TOKEN,
    },
    body: JSON.stringify({}),
  });

  const allowOrigin = headerGet(res.headers, 'access-control-allow-origin');
  const originOk = allowOrigin === origin;

  return {
    label,
    status: res.status,
    allowOrigin,
    pass: origin === BLOCKED_ORIGIN ? !allowOrigin : originOk,
    note:
      origin !== BLOCKED_ORIGIN && res.status === 401
        ? '401 expected without valid device token'
        : undefined,
  };
}

async function testEnrollBrowserPreflight() {
  const url = `${API}/devices/enroll-browser`;
  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: FRONT_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  const allowOrigin = headerGet(res.headers, 'access-control-allow-origin');
  return {
    label: 'enroll-browser preflight',
    status: res.status,
    allowOrigin,
    pass: allowOrigin === FRONT_ORIGIN,
  };
}

function printResult(result) {
  const mark = result.pass ? 'PASS' : 'FAIL';
  console.log(`\n[${mark}] ${result.label}`);
  console.log(`  status: ${result.status}`);
  if (result.allowOrigin !== undefined) {
    console.log(
      `  access-control-allow-origin: ${result.allowOrigin ?? '(missing)'}`,
    );
  }
  if (result.allowHeaders) {
    console.log(`  access-control-allow-headers: ${result.allowHeaders}`);
  }
  if (result.allowMethods) {
    console.log(`  access-control-allow-methods: ${result.allowMethods}`);
  }
  if (result.note) console.log(`  note: ${result.note}`);
}

async function main() {
  console.log(`Testing CORS against ${API}`);

  const results = [
    await testPreflight(FRONT_ORIGIN, 'heartbeat preflight (front origin)'),
    await testPreflight(BLOCKED_ORIGIN, 'heartbeat preflight (blocked origin)'),
    await testPatch(FRONT_ORIGIN, 'heartbeat PATCH (front origin)'),
    await testPatch(BLOCKED_ORIGIN, 'heartbeat PATCH (blocked origin)'),
    await testEnrollBrowserPreflight(),
  ];

  for (const result of results) printResult(result);

  const failed = results.filter((r) => !r.pass).length;
  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }

  console.log('\nAll CORS checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
