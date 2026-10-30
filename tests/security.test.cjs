const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runtime, kv, requestContext: ctx, image, face, sqliteD1 } = require('./helpers.cjs');
const signing = { APP_SIGNING_SECRET: 'test-signing-key-with-at-least-32-characters' };
const localEnv = { ...signing, FACEPP_KEY: 'test', FACEPP_SECRET: 'test', TURNSTILE_SECRET_KEY: 'test-turnstile' };
const adminEnv = () => ({ ...signing, SESSION_KV: kv(), ALLOWED_GITHUB_USERS: 'Admin' });
async function adminSession(env) {
  await env.SESSION_KV.put('admin-session', JSON.stringify({ username: 'Admin', lastActivity: Date.now() }));
  return { Cookie: 'session_id=admin-session' };
}
function mockAnalysis(r, ai) {
  r.context.fetch = async url => {
    if (String(url).includes('siteverify')) return Response.json({ success: true });
    if (String(url).includes('facepp')) return Response.json({ faces: [face(ai?.smileName)] });
    throw new Error('Unexpected URL: ' + url);
  };
}

test('analysis supports documented smile and compatible smiling, zero health, correct gender and percentage scale', async () => {
  for (const name of ['score', 'fortune']) for (const smileName of ['smile', 'smiling']) {
    const r = runtime(); mockAnalysis(r, { smileName });
    let prompt;
    const env = { ...localEnv, AI: { async run(model, input) { prompt = input.messages[0].content; return { response: '中文测试报告' }; } } };
    const route = await r.module(`functions/api/${name}.js`);
    const response = await route.onRequestPost(ctx(`/api/${name}`, env, { image, turnstile_response: 'valid', debug: true }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.logs, undefined);
    if (name === 'score') { assert.equal(result.score, 72); assert.match(prompt, /happiness\(90\.0%\)/); assert.match(prompt, /左眼闭合度 5\.0%/); }
    else { assert.match(prompt, /颜值基础分：72/); assert.equal(result.traits.health_score, 0); assert.match(prompt, /微笑表现：85/); }
  }
});

test('missing required face attributes fail clearly; optional attributes do not crash', async () => {
  const r = runtime();
  r.context.fetch = async url => Response.json(String(url).includes('siteverify') ? { success: true } : { faces: [{ attributes: {} }] });
  for (const name of ['score', 'fortune']) {
    const route = await r.module(`functions/api/${name}.js`);
    assert.equal((await route.onRequestPost(ctx('/api/' + name, localEnv, { image, turnstile_response: 'valid' }))).status, 502);
  }
});

test('fake mini-program flag cannot bypass any analysis route and never calls providers', async () => {
  for (const name of ['score', 'fortune', 'couple']) {
    const r = runtime(), route = await r.module(`functions/api/${name}.js`);
    const body = name === 'couple' ? { imageA: image, imageB: image } : { image };
    const result = await route.onRequestPost(ctx('/api/' + name, localEnv, { ...body, app_type: 'miniprogram' }));
    assert.equal(result.status, 401);
  }
});

test('web requires Turnstile, rejects invalid/cross-origin requests, localhost opt-out is explicit', async () => {
  const r = runtime(), route = await r.module('functions/api/score.js');
  const base = { FACEPP_KEY: 'x', FACEPP_SECRET: 'y' };
  assert.equal((await route.onRequestPost(ctx('/api/score', base, { image }))).status, 503);
  assert.equal((await route.onRequestPost(ctx('/api/score', localEnv, { image }))).status, 403);
  assert.equal((await route.onRequestPost(ctx('/api/score', localEnv, { image }, { Origin: 'https://evil.test' }))).status, 403);
  const access = await r.module('functions/lib/access.js');
  assert.equal(access.isLocalDevelopment(ctx('/api', { ALLOW_INSECURE_LOCAL_DEV: 'true' })), false);
  assert.equal(access.isLocalDevelopment({ env: { ALLOW_INSECURE_LOCAL_DEV: 'true' }, request: new Request('http://localhost:8788/api') }), true);
});

test('wechat code exchange grants only a scoped, expiring token, invalid codes grant none', async () => {
  const r = runtime(); let codeSeen;
  r.context.fetch = async url => { const u = new URL(url); codeSeen = u.searchParams.get('js_code'); return Response.json(codeSeen === 'valid-code' ? { openid: 'user-1', session_key: 'must-never-leak' } : { errcode: 40029 }); };
  const env = { ...signing, WECHAT_APPID: 'app', WECHAT_APPSECRET: 'server-secret' };
  const route = await r.module('functions/api/miniprogram-session.js');
  const response = await route.onRequestPost(ctx('/api/miniprogram-session', env, { code: 'valid-code' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const result = await response.json(); assert.equal(result.session_key, undefined);
  const tokens = await r.module('functions/lib/tokens.js');
  assert.equal((await tokens.verifyToken(env, result.token, 'miniprogram')).sub, 'user-1');
  assert.equal(await tokens.verifyToken(env, result.token, 'image'), null);
  assert.equal((await route.onRequestPost(ctx('/api/miniprogram-session', env, { code: 'bad-code' }))).status, 401);
  assert.equal(JSON.stringify(r.logs).includes('must-never-leak'), false);
});

test('real mini-program session must still pass server-side safety on exact submitted images', async () => {
  const r = runtime(); const tokens = await r.module('functions/lib/tokens.js');
  const token = await tokens.signToken(signing, 'miniprogram', { sub: 'user-1' }, 3600);
  const env = { ...localEnv, WECHAT_APPID: 'app', WECHAT_APPSECRET: 'secret' };
  let safety = 0, faceCalls = 0;
  r.context.fetch = async url => {
    if (String(url).includes('/cgi-bin/token')) return Response.json({ access_token: 'wx-access', expires_in: 7200 });
    if (String(url).includes('img_sec_check')) { safety++; return Response.json({ errcode: 87014 }); }
    if (String(url).includes('facepp')) { faceCalls++; return Response.json({ faces: [face()] }); }
    throw new Error('Unexpected provider');
  };
  const route = await r.module('functions/api/couple.js');
  const result = await route.onRequestPost(ctx('/api/couple', env, { imageA: image, imageB: image, app_type: 'miniprogram' }, { Authorization: 'Bearer ' + token }));
  assert.equal(result.status, 403); assert.equal(safety, 1); assert.equal(faceCalls, 0);
  r.context.fetch = async url => {
    if (String(url).includes('img_sec_check')) { safety++; return Response.json({ errcode: 0 }); }
    if (String(url).includes('facepp')) { faceCalls++; return Response.json({ faces: [face()] }); }
    throw new Error('Unexpected provider');
  };
  const passed = await route.onRequestPost(ctx('/api/couple', env, { imageA: image, imageB: image, app_type: 'miniprogram' }, { Authorization: 'Bearer ' + token }));
  assert.equal(passed.status, 200); assert.equal(safety, 3); assert.equal(faceCalls, 2);
});

test('images require admin session or matching signed URL; tampered, expired and cross-purpose tokens fail', async () => {
  const r = runtime(), tokens = await r.module('functions/lib/tokens.js'), route = await r.module('functions/api/image.js');
  const md5 = 'a'.repeat(32), env = adminEnv();
  let reads = 0;
  env.FACE_IMAGES = { async get(key) { reads++; return { body: 'image-bytes', httpEtag: 'etag', writeHttpMetadata(h) { h.set('Content-Type', 'image/png'); } }; } };
  assert.equal((await route.onRequestGet(ctx('/api/image?md5=' + md5, env))).status, 401);
  const url = await tokens.imageAccessUrl(env, '/api/image?md5=' + md5);
  const good = await route.onRequestGet(ctx(url, env));
  assert.equal(good.status, 200); assert.equal(good.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await route.onRequestGet(ctx(url.replace('md5=' + md5, 'md5=' + 'b'.repeat(32)), env))).status, 401);
  assert.equal((await route.onRequestGet(ctx(url + 'x', env))).status, 401);
  const expired = await tokens.signToken(env, 'image', { md5 }, -1);
  assert.equal((await route.onRequestGet(ctx(`/api/image?md5=${md5}&token=${expired}`, env))).status, 401);
  const other = await tokens.signToken(env, 'miniprogram', { sub: 'user' });
  assert.equal((await route.onRequestGet(ctx(`/api/image?md5=${md5}&token=${other}`, env))).status, 401);
  assert.equal((await route.onRequestGet(ctx('/api/image?md5=' + md5, env, undefined, await adminSession(env)))).status, 200);
  assert.equal(reads, 2);
});

test('admin endpoints reject BYPASS_AUTH, removed allowed users and cross-site deletion', async () => {
  const r = runtime(), env = { ...adminEnv(), BYPASS_AUTH: 'true' };
  for (const [file, handler, body] of [['auth', 'onRequestGet'], ['images', 'onRequestGet'], ['images', 'onRequestDelete', { ids: ['x'] }]]) {
    const route = await r.module(`functions/api/${file}.js`);
    assert.equal((await route[handler](ctx('/api/' + file, env, body, {}, handler === 'onRequestDelete' ? 'DELETE' : 'GET'))).status, 401);
  }
  const headers = await adminSession(env), route = await r.module('functions/api/images.js');
  assert.equal((await route.onRequestDelete(ctx('/api/images', env, { ids: ['x'] }, { ...headers, Origin: 'https://evil.test' }, 'DELETE'))).status, 403);
  env.ALLOWED_GITHUB_USERS = 'someone-else';
  const access = await r.module('functions/lib/access.js');
  assert.equal((await access.verifySession(ctx('/api', env, undefined, headers).request, env)).valid, false);
});

test('maintenance requires a token or administrator and GET cleanup cannot mutate', async () => {
  const r = runtime(), route = await r.module('functions/api/cleanup.js'), verify = await r.module('functions/api/verify.js');
  assert.equal(route.onRequestGet().status, 405);
  assert.equal((await route.onRequestPost(ctx('/api/cleanup', {}, undefined, {}, 'POST'))).status, 401);
  assert.equal((await verify.onRequestGet(ctx('/api/verify', {}))).status, 401);
  const access = await r.module('functions/lib/access.js');
  const env = { MAINTENANCE_TOKEN: 'maintenance-secret-at-least-32-characters' };
  assert.equal(await access.authorizeMaintenance(ctx('/api/cleanup', env, undefined, { Authorization: 'Bearer ' + env.MAINTENANCE_TOKEN }, 'POST')), true);
  assert.equal(await access.authorizeMaintenance(ctx('/api/cleanup', env, undefined, { Authorization: 'Bearer wrong' }, 'POST')), false);
});

test('OAuth state and PKCE round trip, replay rejection, allowlist and no credential logs', async () => {
  const r = runtime(), env = { ...adminEnv(), OAUTH_GITHUB_CLIENT_ID: 'client-id', OAUTH_GITHUB_CLIENT_SECRET: 'sensitive-oauth-secret' };
  const start = await r.module('functions/api/auth/github.js'), callback = await r.module('functions/api/auth/github/callback.js');
  const response = await start.onRequestGet(ctx('/api/auth/github', env));
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location')), state = location.searchParams.get('state');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const cookie = { Cookie: `oauth_state=${state}` };
  assert.equal((await callback.onRequestGet(ctx('/api/auth/github/callback?code=code&state=wrong', env, undefined, cookie))).status, 400);
  let exchanges = 0;
  r.context.fetch = async (url, options) => {
    if (String(url).includes('access_token')) { exchanges++; assert.ok(options.body.get('code_verifier')); return Response.json({ access_token: 'sensitive-access-token' }); }
    return Response.json({ login: 'Admin' });
  };
  const url = `/api/auth/github/callback?code=secret-code&state=${state}`;
  const success = await callback.onRequestGet(ctx(url, env, undefined, cookie));
  assert.equal(success.status, 302); assert.equal(success.headers.get('Location'), '/archive');
  assert.match(success.headers.get('Set-Cookie'), /session_id=/);
  assert.equal((await callback.onRequestGet(ctx(url, env, undefined, cookie))).status, 400);
  assert.equal(exchanges, 1);
  assert.doesNotMatch(JSON.stringify(r.logs), /sensitive-|secret-code/);
  const second = await start.onRequestGet(ctx('/api/auth/github', env));
  const state2 = new URL(second.headers.get('Location')).searchParams.get('state');
  r.context.fetch = async url => Response.json(String(url).includes('access_token') ? { access_token: 'token' } : { login: 'stranger' });
  assert.equal((await callback.onRequestGet(ctx(`/api/auth/github/callback?code=x&state=${state2}`, env, undefined, { Cookie: `oauth_state=${state2}` }))).status, 403);
});

test('limiter honors thresholds and fails closed on KV failure', async () => {
  const r = runtime(), module = await r.module('functions/lib/rate-limit.js');
  const context = ctx('/api/test', { RATE_LIMIT_KV: kv() });
  for (let i = 0; i < 2; i++) assert.equal((await module.rateLimit(context.request, context, { path: '/api/test', limit: 2 })).limited, false);
  assert.equal((await module.rateLimit(context.request, context, { path: '/api/test', limit: 2 })).response.status, 429);
  context.env.RATE_LIMIT_KV.get = async () => { throw new Error('storage failure'); };
  assert.equal((await module.rateLimit(context.request, context, { path: '/api/test', limit: 2 })).response.status, 503);
});

test('image validation rejects disguised non-images and R2 preserves PNG content type', async () => {
  const r = runtime(), validation = await r.module('functions/lib/validator.js'), storage = await r.module('functions/lib/storage.js');
  assert.equal(validation.validateBase64Image('A'.repeat(120)).valid, false);
  assert.equal(validation.validateBase64Image(image).contentType, 'image/png');
  let metadata;
  await storage.uploadImage({ async put(key, bytes, options) { metadata = options.httpMetadata; } }, image, 'a'.repeat(32));
  assert.equal(metadata.contentType, 'image/png');
});

test('SQLite-backed archive deletion retains shared images and queues failed R2 deletions for retry', async t => {
  const r = runtime(), db = await r.module('functions/lib/db.js'), d1 = sqliteD1(t);
  const env = { ...adminEnv(), FACE_SCORE_DB: d1 }, headers = await adminSession(env);
  const md5 = 'a'.repeat(32);
  for (const [id, type] of [['score-one', 'score'], ['fortune-one', 'fortune']]) {
    await db.insertAnalysis(d1, { id, analysis_type: type, score: 70, comment: 'report', gender: '男', age: 25, timestamp: '2026-10-01T00:00:00.000Z', image_url: '/api/image?md5=' + md5, md5 });
  }
  let deletes = 0;
  env.FACE_IMAGES = { async delete() { deletes++; throw new Error('R2 temporarily unavailable'); } };
  const route = await r.module('functions/api/images.js');
  const first = await route.onRequestDelete(ctx('/api/images', env, { ids: ['score-one'] }, headers, 'DELETE'));
  assert.equal(first.status, 200); assert.equal(deletes, 0);
  assert.equal((await first.json()).retainedByOtherRecords, 1);
  const second = await route.onRequestDelete(ctx('/api/images', env, { ids: ['fortune-one'] }, headers, 'DELETE'));
  assert.equal(second.status, 200); assert.equal((await second.json()).pendingImageDeletes, 1);
  assert.deepEqual(Array.from(await db.getQueuedImageDeletions(d1)), [md5]);
  const cleanup = await r.module('functions/api/cleanup.js');
  env.FACE_IMAGES.delete = async () => { deletes++; };
  const retry = await cleanup.onRequestPost(ctx('/api/cleanup', env, undefined, headers, 'POST'));
  assert.equal(retry.status, 200); assert.equal((await retry.json()).deletedImages, 1);
  assert.equal((await db.getQueuedImageDeletions(d1)).length, 0);

  // Uploads that cannot save metadata must also leave a recoverable queue entry.
  mockAnalysis(r);
  const wrapped = Object.create(d1);
  wrapped.prepare = sql => {
    if (/INSERT INTO score_analyses/.test(sql)) throw new Error('simulated metadata failure');
    return d1.prepare(sql);
  };
  let uploadedType;
  env.FACE_IMAGES.put = async (key, bytes, options) => { uploadedType = options.httpMetadata.contentType; };
  const scoreRoute = await r.module('functions/api/score.js');
  const analysisEnv = { ...env, ...localEnv, FACE_SCORE_DB: wrapped };
  const failedSave = await scoreRoute.onRequestPost(ctx('/api/score', analysisEnv, { image, turnstile_response: 'valid' }));
  assert.equal(failedSave.status, 200);
  const unsaved = await failedSave.json();
  assert.equal(unsaved.key, null); assert.match(unsaved.image_url, /token=/);
  assert.equal(uploadedType, 'image/png');
  assert.equal((await db.getQueuedImageDeletions(d1)).length, 1);
  const retriedUpload = await cleanup.onRequestPost(ctx('/api/cleanup', env, undefined, headers, 'POST'));
  assert.equal(retriedUpload.status, 200);
  assert.equal((await db.getQueuedImageDeletions(d1)).length, 0);
});

test('mini-program client shares login and refreshes an expired token without logging it', async () => {
  let app, logins = 0, calls = 0;
  const wx = {
    login({ success }) { logins++; success({ code: 'wx-code' }); },
    request(options) {
      if (options.url.endsWith('miniprogram-session')) return options.success({ statusCode: 200, data: { token: 'private-token-' + logins, expires_in: 3600 } });
      calls++; assert.match(options.header.Authorization, /^Bearer private-token-/);
      options.success(calls === 1 ? { statusCode: 401, data: { error: 'expired' } } : { statusCode: 200, data: { score: 72 } });
    }
  };
  vm.runInNewContext(fs.readFileSync('face-score-miniprogram/app.js', 'utf8'), { require: () => ({ apiUrl: 'https://example.test' }), App: value => { app = value; }, wx, console: { log() {} } });
  const [a, b] = await Promise.all([app.getSessionToken(), app.getSessionToken()]);
  assert.equal(a, b); assert.equal(logins, 1);
  const response = await app.apiRequest('/api/score', { image });
  assert.equal(response.data.score, 72); assert.equal(logins, 2); assert.equal(calls, 2);
});

test('web submission renders AI markup as text and preserves score, fortune and couple flows', async () => {
  const source = [...fs.readFileSync('public/index.html', 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      style: {}, files: [{}], dataset: {}, classList: { add() {}, remove() {} },
      addEventListener() {}, querySelector() { return element('buttonText'); }, appendChild() {},
      set innerHTML(value) { assert.doesNotMatch(value, /onerror|UNTRUSTED/); this.html = value; },
      get innerHTML() { return this.html; }
    });
    return elements.get(id);
  }
  const pending = [];
  const document = { addEventListener() {}, getElementById: element, querySelector: element, querySelectorAll: () => [], createElement: () => ({}) };
  let mode, resetId;
  const context = vm.createContext({
    document, window: { location: {} }, alert() {}, console,
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,' + image; pending.push(Promise.resolve().then(() => this.onload())); } },
    turnstile: { render() { return 'real-widget-id'; }, getResponse(id) { assert.equal(id, 'real-widget-id'); return 'valid'; }, reset(id) { resetId = id; } },
    fetch: async (url, options) => {
      if (url === '/api/turnstile') return Response.json({ site_key: 'public-site-key' });
      const body = JSON.parse(options.body); assert.equal(body.turnstile_response, 'valid');
      assert.equal(url, '/api/' + mode);
      if (mode === 'fortune') return Response.json({ type: 'fortune', title: '报告', comment: '<img onerror="UNTRUSTED">', key: 'saved' });
      return Response.json({ score: 72, comment: '测试点评', grade: '测试等级', key: 'saved' });
    }
  });
  vm.runInContext(source, context);
  await vm.runInContext('initTurnstile()', context);
  for (mode of ['score', 'fortune', 'couple']) {
    vm.runInContext(`currentMode = '${mode}'`, context);
    await vm.runInContext('handleSubmit()', context);
    while (pending.length) await pending.shift();
    const result = element('resultCard').innerText;
    if (mode === 'fortune') assert.match(result, /<img onerror="UNTRUSTED">/);
    else assert.match(result, /72/);
    assert.equal(resetId, 'real-widget-id');
  }
});
