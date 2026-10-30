const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { runtime, kv, requestContext: ctx, image, face, sqliteD1 } = require('./helpers.cjs');
const base = {
  MCP_ENABLED: 'true', MCP_ORIGIN: 'https://example.test', MCP_REDIRECT_URI: 'https://chatgpt.com/connector_platform_oauth_redirect',
  MCP_OWNER_GITHUB_USER: 'owner', MCP_CLIENT_ID: 'face-score-personal', MCP_CLIENT_SECRET: 'test-client-secret-with-at-least-32-characters',
  ALLOWED_GITHUB_USERS: 'owner,other-admin', OAUTH_GITHUB_CLIENT_ID: 'github-client', OAUTH_GITHUB_CLIENT_SECRET: 'github-secret',
  APP_SIGNING_SECRET: 'test-signing-secret-with-at-least-32-characters', FACEPP_KEY: 'face-key', FACEPP_SECRET: 'face-secret'
};
function formContext(path, env, data, headers = {}) {
  return { env, request: new Request('https://example.test' + path, { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(data) }) };
}
const file = (url = 'https://files.oaiusercontent.com/image?private=signed-query') => ({ file_id: 'file-test', download_url: url, mime_type: 'image/png', file_name: 'photo.png' });
const pkce = async verifier => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');

test('private MCP OAuth: real SQLite one-time code, PKCE, single owner, refresh rotation/replay revocation and scoped access', async t => {
  const r = runtime(), db = sqliteD1(t), env = { ...base, FACE_SCORE_DB: db, SESSION_KV: kv() };
  const oauth = await r.module('functions/lib/mcp/oauth.js'), tokens = await r.module('functions/lib/tokens.js');
  const authorize = await r.module('functions/api/mcp/oauth/authorize.js'), consent = await r.module('functions/api/mcp/oauth/consent.js');
  const token = await r.module('functions/api/mcp/oauth/token.js'), revoke = await r.module('functions/api/mcp/oauth/revoke.js');
  const resource = await r.module('functions/.well-known/oauth-protected-resource/mcp.js'), metadata = await r.module('functions/.well-known/oauth-authorization-server.js');
  const verifier = 'v'.repeat(64), challenge = await pkce(verifier);
  const params = { client_id: base.MCP_CLIENT_ID, redirect_uri: base.MCP_REDIRECT_URI, response_type: 'code', scope: 'face:analyze', resource: 'https://example.test/mcp', state: 'client-state', code_challenge_method: 'S256', code_challenge: challenge };
  const route = '/api/mcp/oauth/authorize?' + new URLSearchParams(params);
  const meta = await (await metadata.onRequestGet(ctx('/.well-known/oauth-authorization-server', env))).json();
  assert.equal(meta.issuer, 'https://example.test'); assert.equal(meta.authorization_response_iss_parameter_supported, true);
  assert.ok(meta.code_challenge_methods_supported.includes('S256'));
  assert.equal((await (await resource.onRequestGet(ctx('/.well-known/oauth-protected-resource/mcp', env))).json()).resource, 'https://example.test/mcp');
  const invalid = await authorize.onRequestGet(ctx('/api/mcp/oauth/authorize?' + new URLSearchParams({ ...params, redirect_uri: 'https://evil.test/callback' }), env));
  assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('Location'), null);
  const initiated = await authorize.onRequestGet(ctx(route, env));
  assert.equal(initiated.status, 200); assert.equal(initiated.headers.get('Location'), null);
  assert.match(initiated.headers.get('Content-Type'), /text\/html/);
  assert.equal(initiated.headers.get('Referrer-Policy'), 'same-origin');
  assert.match(await initiated.text(), /href="\/api\/auth\/github\?mcp_continue=/);
  assert.match(initiated.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const flowCookie = initiated.headers.get('Set-Cookie').split(';')[0], flowId = flowCookie.split('=')[1];
  await env.SESSION_KV.put('owner-session', JSON.stringify({ username: 'Owner', lastActivity: Date.now() }));
  await env.SESSION_KV.put('other-session', JSON.stringify({ username: 'other-admin', lastActivity: Date.now() }));
  const headers = { Cookie: flowCookie + '; session_id=owner-session' };
  const wrongOwner = await consent.onRequestGet(ctx('/api/mcp/oauth/consent', env, undefined, { Cookie: flowCookie + '; session_id=other-session' }));
  assert.equal(wrongOwner.status, 403);
  const page = await consent.onRequestGet(ctx('/api/mcp/oauth/consent', env, undefined, headers));
  assert.equal(page.status, 200); assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(page.headers.get('Referrer-Policy'), 'strict-origin');
  // Chromium checks form-action against the OAuth POST redirect destination too.
  assert.ok(page.headers.get('Content-Security-Policy').includes("form-action 'self' " + base.MCP_REDIRECT_URI + ';'));
  assert.ok(!page.headers.get('Content-Security-Policy').includes('https:;'));
  const html = await page.text(), csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  assert.match(html, /Face\+\+/); assert.doesNotMatch(html, /test-client-secret/);
  const rejectedCsrf = await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf: 'bad' }, headers));
  assert.equal(rejectedCsrf.status, 403);
  const deniedOrigin = await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf }, { ...headers, Origin: 'https://evil.test' }));
  assert.equal(deniedOrigin.status, 403);
  const nullOrigin = await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf }, { ...headers, Origin: 'null' }));
  assert.equal(nullOrigin.status, 403);
  const approved = await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf }, { ...headers, Origin: base.MCP_ORIGIN, 'Sec-Fetch-Site': 'same-origin' }));
  assert.equal(approved.status, 302);
  const callback = new URL(approved.headers.get('Location'));
  assert.equal(callback.origin, 'https://chatgpt.com'); assert.equal(callback.searchParams.get('state'), params.state); assert.equal(callback.searchParams.get('iss'), base.MCP_ORIGIN);
  const code = callback.searchParams.get('code'); assert.ok(code);
  assert.equal((await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf }, headers))).status, 400);
  const exchange = { client_id: base.MCP_CLIENT_ID, client_secret: base.MCP_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: base.MCP_REDIRECT_URI, resource: params.resource, code_verifier: verifier };
  assert.equal((await token.onRequestPost(formContext('/api/mcp/oauth/token', env, { ...exchange, code_verifier: 'z'.repeat(64) }))).status, 400);
  assert.equal((await token.onRequestPost(formContext('/api/mcp/oauth/token', env, { ...exchange, resource: 'https://evil.test/mcp' }))).status, 400);
  assert.equal((await token.onRequestPost(formContext('/api/mcp/oauth/token', env, { ...exchange, client_secret: 'wrong' }))).status, 401);
  const first = await token.onRequestPost(formContext('/api/mcp/oauth/token', env, exchange));
  assert.equal(first.status, 200); const pair = await first.json(); assert.ok(pair.refresh_token); assert.equal(pair.expires_in, 3600);
  assert.equal((await token.onRequestPost(formContext('/api/mcp/oauth/token', env, exchange))).status, 400);
  const accessContext = value => ctx('/mcp', env, undefined, { Authorization: 'Bearer ' + value });
  assert.equal((await oauth.authenticate(accessContext(pair.access_token))).owner, 'owner');
  assert.equal(await oauth.authenticate(accessContext(pair.refresh_token)), null);
  assert.equal(await oauth.authenticate(accessContext(await tokens.signToken(env, 'miniprogram', { sub: 'someone' }))), null);
  assert.equal(await oauth.authenticate(ctx('/mcp', { ...env, MCP_CLIENT_SECRET: base.MCP_CLIENT_SECRET + 'rotated' }, undefined, { Authorization: 'Bearer ' + pair.access_token })), null);
  const stored = await db.prepare('SELECT token_hash FROM mcp_oauth_tokens').all();
  assert.ok(stored.results.every(row => row.token_hash !== pair.access_token && row.token_hash !== pair.refresh_token));
  const refreshArgs = { client_id: base.MCP_CLIENT_ID, client_secret: base.MCP_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: pair.refresh_token, resource: params.resource };
  const rotated = await token.onRequestPost(formContext('/api/mcp/oauth/token', env, refreshArgs));
  assert.equal(rotated.status, 200); const secondPair = await rotated.json();
  assert.equal(await oauth.authenticate(accessContext(pair.access_token)), null);
  assert.equal((await oauth.authenticate(accessContext(secondPair.access_token))).owner, 'owner');
  assert.equal((await token.onRequestPost(formContext('/api/mcp/oauth/token', env, refreshArgs))).status, 400);
  assert.equal(await oauth.authenticate(accessContext(secondPair.access_token)), null);
  // A fresh consent supports confidential-client Basic auth and explicit revocation.
  const secondFlow = await authorize.onRequestGet(ctx(route, env, undefined, { Cookie: 'session_id=owner-session' }));
  const cookie2 = secondFlow.headers.get('Set-Cookie').split(';')[0];
  assert.equal(secondFlow.status, 200); assert.equal(secondFlow.headers.get('Location'), null);
  const secondHtml = await secondFlow.text();
  const continuePath = secondHtml.match(/href="([^"]+)"/)[1];
  assert.match(continuePath, /^\/api\/mcp\/oauth\/consent\?mcp_continue=/);
  const sessionOnly = { Cookie: 'session_id=owner-session' };
  const recoveredPage = await consent.onRequestGet(ctx(continuePath, env, undefined, sessionOnly));
  assert.equal(recoveredPage.status, 200);
  const recoveredCsrf = (await recoveredPage.text()).match(/name="csrf" value="([^"]+)"/)[1];
  const otherSession = await consent.onRequestGet(ctx(continuePath, env, undefined, { Cookie: 'session_id=other-session' }));
  assert.equal(otherSession.status, 403);
  const forgedPath = continuePath.slice(0, -3) + 'xxx';
  assert.equal((await consent.onRequestGet(ctx(forgedPath, env, undefined, sessionOnly))).status, 403);
  await env.SESSION_KV.put('owner-session-2', JSON.stringify({ username: 'owner', lastActivity: Date.now() }));
  assert.equal((await consent.onRequestGet(ctx(continuePath, env, undefined, { Cookie: 'session_id=owner-session-2' }))).status, 403);
  assert.equal((await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf: recoveredCsrf }, { Cookie: 'session_id=owner-session-2' }))).status, 403);
  const approval2 = await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf: recoveredCsrf }, sessionOnly));
  const basicArgs = { ...exchange, code: new URL(approval2.headers.get('Location')).searchParams.get('code') }; delete basicArgs.client_secret;
  const basic = { Authorization: 'Basic ' + Buffer.from(base.MCP_CLIENT_ID + ':' + base.MCP_CLIENT_SECRET).toString('base64') };
  const thirdPair = await (await token.onRequestPost(formContext('/api/mcp/oauth/token', env, basicArgs, basic))).json();
  assert.ok(thirdPair.access_token);
  await db.prepare("UPDATE mcp_oauth_tokens SET expires_at = 0 WHERE kind = 'access'").run();
  assert.equal(await oauth.authenticate(accessContext(thirdPair.access_token)), null);
  assert.equal((await revoke.onRequestPost(formContext('/api/mcp/oauth/revoke', env, { token: thirdPair.access_token }, basic))).status, 200);
  assert.equal(await oauth.authenticate(accessContext(thirdPair.access_token)), null);
  assert.equal((await db.prepare('SELECT id FROM mcp_oauth_flows WHERE id = ?').bind(flowId).all()).results.length, 0);
  assert.doesNotMatch(JSON.stringify(r.logs), /test-client-secret|face-secret|signed-query/);
});

test('MCP transport discovery, three file schemas, authenticated initialize/list/call, origin and purpose separation', async () => {
  const r = runtime(), route = await r.module('functions/mcp.js');
  const env = { ...base, SESSION_KV: kv(), FACE_SCORE_DB: { prepare() { return { bind() { return this; }, async first() { return { owner: 'owner' }; } }; }, async batch() { return []; } } };
  const rpc = (method, params, extra = {}) => ctx('/mcp', env, { jsonrpc: '2.0', id: 1, method, params }, { Authorization: 'Bearer ' + 'a'.repeat(72), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...extra });
  const unauth = await route.onRequestGet(ctx('/mcp', env));
  assert.equal(unauth.status, 401); assert.match(unauth.headers.get('WWW-Authenticate'), /oauth-protected-resource\/mcp/);
  assert.equal((await route.onRequestPost(rpc('ping', undefined, { Origin: 'https://evil.test' }))).status, 403);
  const init = await (await route.onRequestPost(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }))).json();
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const listed = await (await route.onRequestPost(rpc('tools/list'))).json();
  assert.equal(listed.result.tools.length, 3);
  for (const tool of listed.result.tools) {
    assert.deepEqual(Array.from(tool._meta['openai/fileParams']), ['photos']);
    assert.equal(tool.annotations.openWorldHint, true);
    const schema = tool.inputSchema.properties.photos.items;
    assert.deepEqual(Object.keys(schema.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type']);
    assert.deepEqual(schema.required.sort(), ['download_url', 'file_id']);
    assert.ok(tool.outputSchema);
  }
  assert.equal((await (await route.onRequestPost(rpc('tools/call', { name: 'cleanup' }))).json()).error.code, -32602);
  assert.equal((await route.onRequestPost(rpc('ping', undefined, { 'MCP-Protocol-Version': 'invalid' }))).status, 400);
  const notify = ctx('/mcp', env, { jsonrpc: '2.0', method: 'notifications/initialized' }, { Authorization: 'Bearer ' + 'a'.repeat(72), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' });
  assert.equal((await route.onRequestPost(notify)).status, 202);
  const bytes = Buffer.from(image, 'base64');
  r.context.fetch = async url => String(url).includes('files.oaiusercontent.com') ? new Response(bytes) : Response.json({ faces: [face()] });
  const called = await (await route.onRequestPost(rpc('tools/call', { name: 'analyze_face', arguments: { photos: [file()] } }))).json();
  assert.equal(called.result.isError, false); assert.equal(called.result.structuredContent.people[0].beauty_score, 72);
  assert.equal(called.result.structuredContent.privacy.workers_ai_called, false);
  assert.equal((await route.onRequestPost({ ...rpc('ping'), env: { ...env, MCP_ENABLED: 'false' } })).status, 503);
});

test('all three tools download approved photos and return attributes without AI, storage, image URLs or face tokens', async () => {
  const r = runtime(), { analyze } = await r.module('functions/lib/mcp/tools.js');
  const env = { ...base, AI: { run() { throw new Error('Workers AI must not be called'); } }, FACE_IMAGES: { put() { throw new Error('Must not store photo'); } }, FACE_SCORE_DB: { prepare() { throw new Error('Must not store analysis'); } } };
  let downloads = 0, detections = 0;
  r.context.fetch = async (url, options) => {
    if (String(url).includes('files.oaiusercontent.com')) { downloads++; assert.equal(options.redirect, 'manual'); assert.equal(options.headers, undefined); return new Response(Buffer.from(image, 'base64')); }
    detections++; assert.ok(options.body.get('image_base64')); return Response.json({ faces: [{ ...face(), face_token: 'provider-face-token' }] });
  };
  for (const [name, count] of [['analyze_face', 1], ['analyze_temperament', 1], ['analyze_couple', 2]]) {
    const result = await analyze(name, { photos: Array.from({ length: count }, () => file()) }, env);
    assert.equal(result.people.length, count); assert.equal(result.people[0].smile_intensity, 85);
    assert.equal(result.privacy.photos_stored, false); assert.equal(result.privacy.workers_ai_called, false);
    assert.doesNotMatch(JSON.stringify(result), /provider-face-token|signed-query|download_url/);
  }
  assert.equal(downloads, 4); assert.equal(detections, 4);
});

test('file handling blocks SSRF, redirects, wrong MIME, oversized streams, multiple faces and safety failures', async () => {
  const r = runtime(), { analyze } = await r.module('functions/lib/mcp/tools.js');
  for (const url of ['http://files.oaiusercontent.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://files.oaiusercontent.com.evil.test/a', 'https://user:password@files.oaiusercontent.com/a', 'https://files.oaiusercontent.com:8080/a']) {
    await assert.rejects(analyze('analyze_face', { photos: [file(url)] }, base), /域名未被允许/);
  }
  await assert.rejects(analyze('analyze_couple', { photos: [file()] }, base), /2 张/);
  await assert.rejects(analyze('analyze_face', { photos: [{ ...file(), mime_type: 'text/html' }] }, base), /JPEG/);
  r.context.fetch = async () => new Response(Buffer.from(image, 'base64'), { headers: { 'Content-Length': String(3 * 1024 * 1024) } });
  await assert.rejects(analyze('analyze_face', { photos: [file()] }, base), /超过/);
  r.context.fetch = async () => new Response(Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(analyze('analyze_face', { photos: [file()] }, base), /过大/);
  r.context.fetch = async () => { throw new Error('redirect denied'); };
  await assert.rejects(analyze('analyze_face', { photos: [file()] }, base), /网络连接失败/);
  r.context.fetch = async url => String(url).includes('files.oaiusercontent.com') ? new Response(Buffer.from(image, 'base64')) : Response.json({ faces: [face(), face()] });
  await assert.rejects(analyze('analyze_face', { photos: [file()] }, base), /仅包含一张人脸/);
  let faceCalls = 0;
  r.context.fetch = async url => {
    if (String(url).includes('files.oaiusercontent.com')) return new Response(Buffer.from(image, 'base64'));
    if (String(url).includes('/cgi-bin/token')) return Response.json({ access_token: 'wx-test', expires_in: 7200 });
    if (String(url).includes('img_sec_check')) return Response.json({ errcode: 87014 });
    faceCalls++; throw new Error('Must not detect rejected image');
  };
  await assert.rejects(analyze('analyze_face', { photos: [file()] }, { ...base, WECHAT_APPID: 'wx', WECHAT_APPSECRET: 'secret' }), /未通过内容安全/);
  assert.equal(faceCalls, 0);
});

test('existing GitHub callback resumes only the fixed MCP consent path, without changing normal login', async () => {
  const r = runtime(), route = await r.module('functions/api/auth/github/callback.js');
  const session = kv(), state = '12345678-1234-1234-1234-123456789abc';
  const env = { ...base, SESSION_KV: session };
  const callback = 'https://example.test/api/auth/github/callback';
  await session.put('oauth:' + state, JSON.stringify({ verifier: 'test', callback }));
  r.context.fetch = async url => Response.json(String(url).includes('access_token') ? { access_token: 'github-test-token' } : { login: 'owner' });
  const result = await route.onRequestGet(ctx('/api/auth/github/callback?state=' + state + '&code=code', env, undefined, { Cookie: `oauth_state=${state}; mcp_flow=${state}` }));
  assert.equal(result.status, 302); assert.equal(result.headers.get('Location'), '/api/mcp/oauth/consent');
});

test('MCP login carries the signed flow through GitHub state without an mcp_flow cookie', async t => {
  const r = runtime(), env = { ...base, FACE_SCORE_DB: sqliteD1(t), SESSION_KV: kv() };
  const authorize = await r.module('functions/api/mcp/oauth/authorize.js');
  const login = await r.module('functions/api/auth/github.js');
  const callback = await r.module('functions/api/auth/github/callback.js');
  const consent = await r.module('functions/api/mcp/oauth/consent.js');
  const token = await r.module('functions/api/mcp/oauth/token.js');
  const verifier = 'z'.repeat(64);
  const params = new URLSearchParams({ client_id: base.MCP_CLIENT_ID, redirect_uri: base.MCP_REDIRECT_URI, response_type: 'code', scope: 'face:analyze', resource: base.MCP_ORIGIN + '/mcp', state: 'cookie-loss-test', code_challenge_method: 'S256', code_challenge: await pkce(verifier) });
  const entry = await authorize.onRequestGet(ctx('/api/mcp/oauth/authorize?' + params, env));
  const loginPath = (await entry.text()).match(/href="([^"]+)"/)[1];
  const start = await login.onRequestGet(ctx(loginPath, env));
  assert.equal(start.status, 302);
  const githubState = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = start.headers.get('Set-Cookie').split(';')[0];
  r.context.fetch = async url => Response.json(String(url).includes('access_token') ? { access_token: 'github-test-token' } : { login: 'owner' });
  const returned = await callback.onRequestGet(ctx('/api/auth/github/callback?state=' + githubState + '&code=test', env, undefined, { Cookie: stateCookie }));
  assert.equal(returned.status, 302);
  const sessionCookie = returned.headers.get('Set-Cookie').match(/session_id=([^;,]+)/)[0];
  const path = returned.headers.get('Location');
  assert.match(path, /^\/api\/mcp\/oauth\/consent\?mcp_continue=/);
  const page = await consent.onRequestGet(ctx(path, env, undefined, { Cookie: sessionCookie }));
  assert.equal(page.status, 200);
  const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)[1];
  const approval = await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf }, { Cookie: sessionCookie, Origin: base.MCP_ORIGIN }));
  assert.equal(approval.status, 302);
  const result = new URL(approval.headers.get('Location'));
  assert.equal(result.searchParams.get('state'), 'cookie-loss-test');
  const pair = await token.onRequestPost(formContext('/api/mcp/oauth/token', env, { client_id: base.MCP_CLIENT_ID, client_secret: base.MCP_CLIENT_SECRET, grant_type: 'authorization_code', code: result.searchParams.get('code'), redirect_uri: base.MCP_REDIRECT_URI, resource: base.MCP_ORIGIN + '/mcp', code_verifier: verifier }));
  assert.equal(pair.status, 200);
  assert.ok((await pair.json()).access_token);
  assert.equal((await consent.onRequestPost(formContext('/api/mcp/oauth/consent', env, { decision: 'approve', csrf }, { Cookie: sessionCookie }))).status, 400);
});


test('ChatGPT file hosts include observed Azure regions even with legacy configuration; no Azure wildcards', async () => {
  const r = runtime(), { permittedUrl } = await r.module('functions/lib/mcp/tools.js');
  for (const env of [base, { ...base, MCP_FILE_HOSTS: 'files.oaiusercontent.com' }]) {
    for (const host of ['files.oaiusercontent.com', 'files.openai.com', 'oaisdmntprcentralus.blob.core.windows.net', 'oaisdmntpreastus2.blob.core.windows.net', 'oaisdmntprwestcentralus.blob.core.windows.net']) {
      assert.equal(permittedUrl('https://' + host + '/container/photo?sig=temporary', env).hostname, host);
    }
  }
  const extra = { ...base, MCP_FILE_HOSTS: ' CUSTOM.example.test ,*.blob.core.windows.net' };
  assert.equal(permittedUrl('https://custom.example.test/photo', extra).hostname, 'custom.example.test');
  for (const raw of [
    'https://arbitrary.blob.core.windows.net/photo',
    'https://oaisdmntprunknownregion.blob.core.windows.net/photo',
    'https://oaisdmntpreastus2.blob.core.windows.net.evil.test/photo',
    'https://sub.oaisdmntpreastus2.blob.core.windows.net/photo',
    'https://oaisdmntprwestcentralus.blob.core.windows.net.evil.test/photo',
    'https://oaisdmntpreastus2.blob.core.windows.net@127.0.0.1/photo',
    'http://oaisdmntpreastus2.blob.core.windows.net/photo',
    'https://oaisdmntpreastus2.blob.core.windows.net:8443/photo',
    'https://oaisdmntpreastus2.blob.core.windows.net/photo#fragment'
  ]) assert.throws(() => permittedUrl(raw, extra), /域名未被允许/);
});


test('file download follows only bounded validated redirects and reports safe HTTP/network diagnostics', async () => {
  const r = runtime(), { download } = await r.module('functions/lib/mcp/tools.js');
  let calls = [];
  r.context.fetch = async (url, options) => {
    calls.push(String(url)); assert.equal(options.redirect, 'manual'); assert.equal(options.headers, undefined);
    return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: 'https://oaisdmntpreastus2.blob.core.windows.net/photos/test?sig=private-token' } }) : new Response(Buffer.from(image, 'base64'));
  };
  assert.equal(await download(file(), base), image); assert.equal(calls.length, 2);
  for (const destination of ['https://127.0.0.1/a', 'http://files.openai.com/a', 'https://evil.test/a']) {
    calls = [];
    r.context.fetch = async url => { calls.push(String(url)); return new Response(null, { status: 307, headers: { Location: destination } }); };
    await assert.rejects(download(file(), base), /域名未被允许/); assert.equal(calls.length, 1);
  }
  let count = 0;
  r.context.fetch = async () => new Response(null, { status: 302, headers: { Location: '/next?sig=secret-' + ++count } });
  await assert.rejects(download(file(), base), /超过 3 次/); assert.equal(count, 4);
  r.context.fetch = async () => new Response(null, { status: 302, headers: { Location: file().download_url } });
  await assert.rejects(download(file(), base), /重定向循环/);
  r.context.fetch = async () => new Response('provider secret response', { status: 403 });
  await assert.rejects(download(file(), base), error => /HTTP 403/.test(error.message) && !/signed-query|provider secret/.test(error.message));
  r.context.fetch = async () => { throw new Error('private full URL secret'); };
  await assert.rejects(download(file(), base), error => /network/.test(error.message) && !/private full URL/.test(error.message));
  assert.doesNotMatch(JSON.stringify(r.logs), /private-token|signed-query|secret-|provider secret|private full URL/);
});
