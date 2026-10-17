// Utilitários HTTP: resposta JSON, leitura do corpo, erros com status e limite de requisições.
export const MAX_BODY = 400 * 1024;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}

export function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    // acima do limite: recusa e descarta o resto do corpo (sem derrubar a conexão, para o 413 chegar ao cliente)
    const onData = c => { size += c.length; if (size > max) { req.off('data', onData); req.resume(); reject(new HttpError(413, 'corpo grande demais')); } else chunks.push(c); };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// corpo JSON que precisa ser um objeto; JSON quebrado é 400
export async function readJson(req, max) {
  const text = await readBody(req, max);
  let data;
  try { data = JSON.parse(text || '{}'); } catch (_) { fail(400, 'JSON inválido'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'o corpo deve ser um objeto JSON');
  return data;
}

// limite simples por chave (cliente + grupo de rotas): N requisições por minuto
const hits = new Map();
export function rateLimited(key, perMin) {
  const now = Date.now(), win = hits.get(key) || [];
  const recent = win.filter(t => now - t < 60000);
  recent.push(now); hits.set(key, recent);
  return recent.length > perMin;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of hits) if (!w.some(t => now - t < 60000)) hits.delete(k);
}, 60000).unref();
