import { expect, test } from '@playwright/test';

// The whole site is public. Nothing private may appear in any API response,
// even though the demo backend deliberately returns it (see demo/mock-server.mjs).
const PRIVATE = [
  /192\.168\./, // LAN / registry host
  /172\.20\./, // container IPs
  /do-not-leak/, // docker labels
  /secret-experiment/, // hidden via homelab.hide label
  /"(Ports|Labels|Mounts|Command|NetworkSettings|Id)":/, // raw Docker fields
  /mock:9000|localhost:9000|\/svc\//, // health-check targets
  /\/volume\d|\/dev\//, // raw mount points / devices
  /eth0|docker0/, // interface names
];

for (const endpoint of ['/api/site', '/api/status', '/api/nas', '/api/containers', '/api/log']) {
  test(`${endpoint} leaks nothing private`, async ({ request }) => {
    const res = await request.get(endpoint);
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    for (const pattern of PRIVATE) expect(body, `matched ${pattern}`).not.toMatch(pattern);
  });
}

test('security headers are set', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-powered-by']).toBeUndefined();
});

test('the API is read-only', async ({ request }) => {
  for (const method of ['post', 'put', 'delete'] as const) {
    expect((await request[method]('/api/site')).status()).toBe(405);
  }
});

test('malformed log slugs are rejected', async ({ request }) => {
  expect((await request.get('/api/log/..%2F..%2Fetc%2Fpasswd')).status()).toBe(404);
  expect((await request.get('/api/log/%3Cscript%3E')).status()).toBe(404);
});

test('health reports ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(await res.json()).toEqual({ status: 'ok' });
});
