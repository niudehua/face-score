const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const os = require('node:os');

function runtime() {
  const logs = [];
  const context = vm.createContext({
    crypto: webcrypto, URL, URLSearchParams, TextEncoder, TextDecoder, Request, Response, Headers,
    FormData, Blob, atob, btoa, AbortSignal, setTimeout, clearTimeout,
    console: Object.fromEntries(['log', 'warn', 'error'].map(name => [name, (...args) => logs.push(args)])),
    fetch: () => { throw new Error('Unexpected network request in test'); }
  });
  const cache = new Map();
  async function load(file) {
    file = path.resolve(file);
    if (!cache.has(file)) cache.set(file, (async () => {
      const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file, context });
      await m.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
      return m;
    })());
    return cache.get(file);
  }
  return { context, logs, async module(file) { const m = await load(file); await m.evaluate(); return m.namespace; } };
}
function kv() {
  const map = new Map();
  return { map, async get(key) { return map.get(key) ?? null; }, async put(key, value) { map.set(key, value); }, async delete(key) { map.delete(key); } };
}
function requestContext(route, env = {}, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
  return { env, request: new Request('https://example.test' + route, {
    method, headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }) };
}
const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(100)]).toString('base64');
const face = (smileName = 'smile') => ({ attributes: {
  gender: { value: 'Male' }, age: { value: 25 }, beauty: { male_score: 72, female_score: 88 },
  [smileName]: { value: 85 }, emotion: { happiness: 90 },
  eyestatus: { left_eye_status: { no_glass_eye_close: 5 } }, skinstatus: { health: 0 }
} });
function sqliteD1(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'face-score-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'test.sqlite');
  const python = `import sqlite3,json,sys
payload=json.load(sys.stdin)
conn=sqlite3.connect(sys.argv[1]); conn.row_factory=sqlite3.Row
results=[]
try:
 with conn:
  for q in payload:
   cur=conn.execute(q['sql'],q['args']); rows=[dict(row) for row in cur.fetchall()]
   results.append({'results':rows,'meta':{'changes':max(cur.rowcount,0)}})
 print(json.dumps(results))
except Exception as e:
 print(str(e),file=sys.stderr); sys.exit(1)
`;
  function execute(statements) {
    const result = spawnSync('python3', ['-c', python, dbPath], { input: JSON.stringify(statements), encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return JSON.parse(result.stdout);
  }
  return {
    prepare(sql) {
      const statement = { sql, args: [], bind(...args) { return { ...this, args }; },
        async run() { return execute([this])[0]; }, async all() { return execute([this])[0]; },
        async first() { return execute([this])[0].results[0] ?? null; } };
      return statement;
    },
    async batch(statements) { return execute(statements); }
  };
}
module.exports = { runtime, kv, requestContext, image, face, sqliteD1 };
