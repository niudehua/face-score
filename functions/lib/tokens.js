// Purpose-separated, expiring HMAC capabilities. Keep the signing secret server-side.
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const encoder = new TextEncoder();
async function key(env) {
  if (typeof env.APP_SIGNING_SECRET !== 'string' || env.APP_SIGNING_SECRET.length < 32) throw new Error('APP_SIGNING_SECRET must contain at least 32 characters');
  return crypto.subtle.importKey('raw', encoder.encode(env.APP_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signToken(env, purpose, claims, ttlSeconds = 900) {
  const payload = encode(encoder.encode(JSON.stringify({ ...claims, purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const signature = await crypto.subtle.sign('HMAC', await key(env), encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifyToken(env, token, purpose) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
    if (!await crypto.subtle.verify('HMAC', await key(env), decode(parts[1]), encoder.encode(parts[0]))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return data.purpose === purpose && Number.isFinite(data.exp) && data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}
export async function imageAccessUrl(env, imageUrl) {
  if (!imageUrl) return null;
  const md5 = new URL(imageUrl, 'https://local.invalid').searchParams.get('md5');
  if (!/^[a-f0-9]{32}$/.test(md5 || '')) return null;
  // The stable URL remains usable by administrators when signing is unconfigured.
  if (!env.APP_SIGNING_SECRET || env.APP_SIGNING_SECRET.length < 32) return imageUrl;
  return `/api/image?md5=${md5}&token=${await signToken(env, 'image', { md5 })}`;
}
