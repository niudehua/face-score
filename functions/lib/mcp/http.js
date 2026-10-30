export class McpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers } });
}
export async function readLimited(stream, maxBytes) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new McpError('请求或图片过大', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readForm(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) throw new McpError('需要表单编码请求', 415);
  const text = new TextDecoder().decode(await readLimited(request.body, 16384));
  const form = new URLSearchParams(text);
  for (const name of form.keys()) if (form.getAll(name).length !== 1) throw new McpError('不允许重复参数');
  return form;
}
