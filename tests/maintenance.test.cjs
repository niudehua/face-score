const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runtime, requestContext: ctx } = require('./helpers.cjs');
const token = 'test-maintenance-token-not-to-be-printed-12345';

function scriptHarness(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'face-score-maintenance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = path.join(directory, 'calls.jsonl');
  fs.writeFileSync(path.join(directory, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (option('--header') !== 'Authorization: Bearer ' + process.env.MAINTENANCE_TOKEN) process.exit(90);
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({method:option('--request'),url:args.at(-1)}) + '\\n');
if (process.env.TEST_NETWORK_FAIL === 'true') process.exit(7);
const status = process.env.TEST_HTTP_STATUS || '200';
let body = args.at(-1).includes('/api/cleanup') ? {
 success:true,deletedCount:2,deletedCoupleCount:1,deletedImages:3,pendingImageDeletes:Number(process.env.TEST_PENDING || 0),r2Configured:process.env.TEST_R2 !== 'false'
} : {success:true,compliant:process.env.TEST_COMPLIANT !== 'false'};
if (status !== '200') body = {error:process.env.MAINTENANCE_TOKEN};
fs.writeFileSync(option('--output'), process.env.TEST_INVALID_JSON === 'true' ? '<html>not the API</html>' : JSON.stringify(body));
process.stdout.write(status);
`, { mode: 0o700 });
  return (overrides = {}) => {
    fs.rmSync(calls, { force: true });
    const env = { ...process.env, API_BASE_URL: 'https://example.test/', MAINTENANCE_TOKEN: token, TEST_CALLS: calls, PATH: directory + path.delimiter + process.env.PATH, ...overrides };
    const result = spawnSync('bash', ['scripts/run-maintenance.sh'], { env, encoding: 'utf8', timeout: 15000 });
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(output, new RegExp(token));
    return { status: result.status, output, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [] };
  };
}

test('maintenance workflow script uses bearer authentication without a session; precheck, POST cleanup, postcheck agree', t => {
  const run = scriptHarness(t), result = run();
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.calls, [
    { method: 'GET', url: 'https://example.test/api/verify?action=retention' },
    { method: 'POST', url: 'https://example.test/api/cleanup' },
    { method: 'GET', url: 'https://example.test/api/verify?action=retention' }
  ]);
  assert.match(result.output, /3 records and 3 images deleted/);
  const checkOnly = run({ MAINTENANCE_CHECK_ONLY: 'true' });
  assert.equal(checkOnly.status, 0, checkOnly.output);
  assert.equal(checkOnly.calls.length, 1);
  assert.match(checkOnly.output, /no cleanup was performed/);
});

test('maintenance workflow rejects missing or invalid configuration before any request and never prints secrets', t => {
  const run = scriptHarness(t);
  for (const [env, message] of [
    [{ API_BASE_URL: '' }, /Missing API_BASE_URL/],
    [{ MAINTENANCE_TOKEN: '' }, /Missing MAINTENANCE_TOKEN/],
    [{ MAINTENANCE_TOKEN: 'short' }, /Invalid MAINTENANCE_TOKEN/],
    [{ MAINTENANCE_TOKEN: token + '\n' }, /Invalid MAINTENANCE_TOKEN/],
    [{ API_BASE_URL: 'http://example.test' }, /Invalid API_BASE_URL/],
    [{ API_BASE_URL: 'https://example.test/api' }, /Invalid API_BASE_URL/],
    [{ API_BASE_URL: 'https://user:password@example.test' }, /Invalid API_BASE_URL/],
    [{ API_BASE_URL: 'https://example.test?secret=value' }, /Invalid API_BASE_URL/]
  ]) {
    const result = run(env);
    assert.notEqual(result.status, 0); assert.equal(result.calls.length, 0); assert.match(result.output, message);
  }
});

test('maintenance workflow reports HTTP and response failures without echoing response bodies or redirecting to login', t => {
  const run = scriptHarness(t);
  for (const [env, message] of [
    [{ TEST_HTTP_STATUS: '401' }, /authentication failed.*HTTP 401/],
    [{ TEST_HTTP_STATUS: '403' }, /authentication failed.*HTTP 403/],
    [{ TEST_HTTP_STATUS: '405' }, /endpoint unavailable/],
    [{ TEST_HTTP_STATUS: '302' }, /failed \(HTTP 302\)/],
    [{ TEST_HTTP_STATUS: '429' }, /rate limited/],
    [{ TEST_HTTP_STATUS: '503' }, /D1\/R2 bindings/],
    [{ TEST_NETWORK_FAIL: 'true' }, /failed to reach/],
    [{ TEST_INVALID_JSON: 'true' }, /unexpected response/]
  ]) {
    const result = run(env);
    assert.notEqual(result.status, 0); assert.equal(result.calls.length, 1); assert.match(result.output, message);
    assert.doesNotMatch(result.output, /not the API/);
  }
  for (const [env, message] of [
    [{ TEST_R2: 'false' }, /Bind FACE_IMAGES/],
    [{ TEST_PENDING: '1' }, /Maintenance is incomplete/],
    [{ TEST_COMPLIANT: 'false' }, /Maintenance is incomplete/]
  ]) {
    const result = run(env);
    assert.notEqual(result.status, 0); assert.equal(result.calls.length, 3); assert.match(result.output, message);
  }
});

test('actual maintenance handlers accept the matching token with no cookies, OAuth or SESSION_KV', async () => {
  const r = runtime(); let queries = 0;
  const d1 = {
    prepare() {
      queries++;
      return { bind() { return this; }, async first() { return { count: 0 }; }, async all() { return { results: [] }; }, async run() { return { meta: { changes: 0 } }; } };
    },
    async batch() { return [{ meta: { changes: 0 } }, { meta: { changes: 0 } }]; }
  };
  const env = { MAINTENANCE_TOKEN: token, FACE_SCORE_DB: d1, FACE_IMAGES: { async delete() {} } };
  const headers = { Authorization: 'Bearer ' + token };
  const cleanup = await r.module('functions/api/cleanup.js'), verify = await r.module('functions/api/verify.js');
  const response = await cleanup.onRequestPost(ctx('/api/cleanup', env, undefined, headers, 'POST'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).r2Configured, true);
  const after = await verify.onRequestGet(ctx('/api/verify?action=retention', env, undefined, headers));
  assert.equal(after.status, 200); assert.equal((await after.json()).compliant, true);
  assert.ok(queries > 0);
  for (const serverToken of [undefined, 'short', token + '-different']) {
    const badEnv = { ...env, MAINTENANCE_TOKEN: serverToken };
    const rejected = await cleanup.onRequestPost(ctx('/api/cleanup', badEnv, undefined, headers, 'POST'));
    assert.equal(rejected.status, 401);
    const body = await rejected.text(); assert.doesNotMatch(body, new RegExp(token)); assert.match(body, /维护认证失败/);
  }
});
