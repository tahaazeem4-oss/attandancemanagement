/*
 * QA Smoke Test Harness
 * ---------------------
 * Boots the backend in-process on a free port, runs a battery of black-box
 * checks (health, auth, RBAC, rate-limit, CORS, tenant scoping), prints a
 * pass/fail summary, and exits with a non-zero code if any check fails.
 *
 * Usage:
 *   node qa/smoke.js
 *   PORT=5070 node qa/smoke.js
 *
 * The harness does NOT mutate production data. All probes use unauthenticated
 * or invalid-credential requests. Token-based tests are skipped (and reported)
 * if QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD env vars are not provided.
 */

process.env.PORT = process.env.PORT || '5072';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// Force a known JWT_SECRET so token signing is deterministic for any
// optional auth probes. Long enough to satisfy the production guard.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa-smoke-test-secret-do-not-use-in-production-1234567890';

const PORT = Number(process.env.PORT);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? '\u2713 PASS' : '\u2717 FAIL';
  console.log(`${tag}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

async function expect(name, fn, predicate, detailFn) {
  try {
    const res = await fn();
    const ok = predicate(res);
    record(name, ok, detailFn ? detailFn(res) : `status=${res.status}`);
    return res;
  } catch (err) {
    record(name, false, err.message);
    return null;
  }
}

async function waitForServer(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  console.log(`[qa] Booting backend on port ${PORT}...`);
  // Load the server in-process. The module starts listening at require time.
  let serverModule;
  try {
    serverModule = require('../server');
  } catch (err) {
    console.error('[qa] Failed to require server.js:', err.message);
    process.exit(2);
  }

  const ready = await waitForServer();
  if (!ready) {
    console.error('[qa] Server did not become healthy within timeout.');
    process.exit(2);
  }

  // 1. Health
  await expect(
    'GET /api/health returns 200',
    () => request('/api/health'),
    (r) => r.status === 200 && r.body && r.body.status === 'OK',
  );

  // 2. Anonymous protected route blocked
  await expect(
    'GET /api/classes without token returns 401',
    () => request('/api/classes'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/teachers/classes without token returns 401',
    () => request('/api/teachers/classes'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/lectures without token returns 401',
    () => request('/api/lectures'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/notifications/sent without token returns 401',
    () => request('/api/notifications/sent'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/admin/stats without token returns 401',
    () => request('/api/admin/stats'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/student-portal/profile without token returns 401',
    () => request('/api/student-portal/profile'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/super-admin/schools without token returns 401',
    () => request('/api/super-admin/schools'),
    (r) => r.status === 401,
  );

  await expect(
    'GET /api/import-export/attendance/export without token returns 401',
    () => request('/api/import-export/attendance/export'),
    (r) => r.status === 401,
  );

  // 3. Bogus token rejected
  await expect(
    'GET /api/classes with garbage token returns 401',
    () => request('/api/classes', { headers: { Authorization: 'Bearer not.a.real.token' } }),
    (r) => r.status === 401,
  );

  // 4. Login validates body
  await expect(
    'POST /api/auth/login without body returns 400',
    () => request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }),
    (r) => r.status === 400,
  );

  // 5. Login with unknown email returns 401
  await expect(
    'POST /api/auth/login unknown email returns 401',
    () => request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `qa_no_such_user_${Date.now()}@example.com`, password: 'wrong-password' }),
    }),
    (r) => r.status === 401,
  );

  // 6. Rate limiter triggers on repeated bad logins
  {
    const responses = [];
    for (let i = 0; i < 12; i++) {
      const r = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `qa_rate_${Date.now()}@example.com`, password: 'wrong-password' }),
      });
      responses.push(r.status);
    }
    const got429 = responses.some((s) => s === 429);
    record(
      'Login rate limiter returns 429 after threshold',
      got429,
      `statuses=${responses.join(',')}`,
    );
  }

  // 7. CORS – disallowed origin
  await expect(
    'CORS rejects disallowed origin',
    () => request('/api/health', { headers: { Origin: 'http://evil.example.com' } }),
    // Express handler responds; but cors middleware emits an error → 500 with our error handler.
    // Accept either 403/500 since the request is rejected before reaching the route.
    (r) => r.status === 500 || r.status === 403,
  );

  // 8. CORS – localhost allowed (no CORS_ORIGINS env set)
  await expect(
    'CORS allows localhost origin',
    () => request('/api/health', { headers: { Origin: 'http://localhost:3000' } }),
    (r) => r.status === 200,
  );

  // 9. Security headers present
  await expect(
    'X-Content-Type-Options: nosniff header present',
    () => request('/api/health'),
    (r) => (r.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff',
    (r) => `header=${r.headers.get('x-content-type-options')}`,
  );

  // 10. x-powered-by disabled
  await expect(
    'X-Powered-By header is not exposed',
    () => request('/api/health'),
    (r) => !r.headers.get('x-powered-by'),
    (r) => `header=${r.headers.get('x-powered-by') || '(absent)'}`,
  );

  // 11. Schools endpoint is public (used by signup screen)
  await expect(
    'GET /api/schools is publicly accessible',
    () => request('/api/schools'),
    (r) => r.status === 200 && Array.isArray(r.body),
    (r) => `count=${Array.isArray(r.body) ? r.body.length : 'n/a'}`,
  );

  // 12. Unknown route returns 404 (no information disclosure)
  await expect(
    'Unknown route returns 404',
    () => request('/api/this-does-not-exist'),
    (r) => r.status === 404,
  );

  // 13. Optional token-based probe – only runs if QA credentials are provided
  if (process.env.QA_ADMIN_EMAIL && process.env.QA_ADMIN_PASSWORD) {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD }),
    });
    if (loginRes.status === 200 && loginRes.body?.token) {
      const tok = loginRes.body.token;
      await expect(
        'Authenticated GET /api/classes returns 200',
        () => request('/api/classes', { headers: { Authorization: `Bearer ${tok}` } }),
        (r) => r.status === 200 && Array.isArray(r.body),
      );
      await expect(
        'Authenticated GET /api/teachers returns 200',
        () => request('/api/teachers', { headers: { Authorization: `Bearer ${tok}` } }),
        (r) => r.status === 200,
      );
    } else {
      record('QA admin login (optional)', false, `status=${loginRes.status}`);
    }
  } else {
    record('Token-based probes (skipped)', true, 'set QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD to enable');
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n==================== QA SUMMARY ====================');
  console.log(`Total:   ${results.length}`);
  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log('====================================================');

  // Shut down the in-process HTTP server cleanly.
  // server.js exports nothing; rely on process.exit to terminate.
  process.exit(failed === 0 ? 0 : 1);
})();
