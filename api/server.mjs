// API do Lance a Lance: contas de usuário (MySQL + JWT), partidas e estatísticas, e tutor de IA (intermedia Gemini, DeepSeek e OpenRouter).
// As chaves das IAs e o segredo do JWT moram só aqui (arquivo .env); o app nunca os vê.
// node:http puro, sem framework: são poucas rotas e o roteador abaixo basta.
// Uso: pnpm start  (node --env-file=.env server.mjs)
import http from 'node:http';
import { PORT, HOST, RATE_PER_MIN, AUTH_RATE_PER_MIN, ROLES } from './src/config.mjs';
import { send, HttpError, rateLimited } from './src/http.mjs';
import { ping, query, lastPingError } from './src/db.mjs';
import * as auth from './src/auth.mjs';
import * as users from './src/users.mjs';
import * as games from './src/games.mjs';
import * as stats from './src/stats.mjs';
import { chat, tutorStatus } from './src/tutor.mjs';

const log = (...a) => console.log(new Date().toISOString(), ...a);

// [método, caminho (com :id), handler, grupo do limite de requisições]
const ROUTES = [
  ['POST',  '/v1/auth/register', (req, res) => auth.register(req, res), 'auth'],
  ['POST',  '/v1/auth/login',    (req, res) => auth.login(req, res),    'auth'],
  ['GET',   '/v1/auth/me',       (req, res) => auth.me(req, res)],
  ['GET',   '/v1/users/me',      (req, res) => users.getMe(req, res)],
  ['PATCH', '/v1/users/me',      (req, res) => users.patchMe(req, res)],
  ['GET',   '/v1/users',         (req, res, p, url) => users.list(req, res, url)],
  ['POST',  '/v1/users',         (req, res) => users.create(req, res)],
  ['GET',   '/v1/users/:id',     (req, res, p) => users.getOne(req, res, p.id)],
  ['PATCH', '/v1/users/:id',     (req, res, p) => users.patch(req, res, p.id)],
  ['DELETE','/v1/users/:id',     (req, res, p) => users.remove(req, res, p.id)],
  ['GET',   '/v1/roles',         (req, res) => users.listRoles(req, res)],
  // partidas e estatísticas: sempre do usuário logado (administrador lê de outro com ?user_id=<uuid>).
  // Todo :id e todo user_id são UUID; o id numérico do banco nunca entra nem sai.
  ['GET',   '/v1/games',         (req, res, p, url) => games.list(req, res, url), 'games'],
  ['POST',  '/v1/games',         (req, res) => games.create(req, res), 'games'],
  ['GET',   '/v1/games/:id',     (req, res, p) => games.getOne(req, res, p.id), 'games'],
  ['PATCH', '/v1/games/:id',     (req, res, p) => games.patch(req, res, p.id), 'games'],
  ['DELETE','/v1/games/:id',     (req, res, p) => games.remove(req, res, p.id), 'games'],
  ['GET',   '/v1/stats/me',      (req, res, p, url) => stats.me(req, res, url), 'games'],
  ['GET',   '/v1/stats/me/rating-history', (req, res, p, url) => stats.ratingHistory(req, res, url), 'games'],
  // o tutor exige usuário logado, ativo e não bloqueado
  ['POST',  '/v1/tutor/chat',    async (req, res) => { await auth.requireUser(req); return chat(req, res); }, 'tutor'],
];
const LIMITS = { auth: AUTH_RATE_PER_MIN, tutor: RATE_PER_MIN, games: 300, default: 120 };

function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    // :id é sempre texto; cada módulo valida o formato (uuid) e responde 404 se não servir
    if (a[i].startsWith(':')) {
      if (!b[i]) return null;
      try { params[a[i].slice(1)] = decodeURIComponent(b[i]); } catch (_) { params[a[i].slice(1)] = ''; }
    }
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || '?';
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (_) { return send(res, 400, { ok: false, error: 'URL inválida' }); }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, ai: { ready: tutorStatus().ready }, db: (await ping()) ? 'ok' : 'indisponível' });
    }
    let allowed = false;
    for (const [method, pattern, handler, group] of ROUTES) {
      const params = match(pattern, path);
      if (!params) continue;
      allowed = true;
      if (method !== req.method) continue;
      if (rateLimited(`${ip}:${group || 'default'}`, LIMITS[group || 'default'])) return send(res, 429, { ok: false, error: 'Muitas requisições; espere um minuto.' });
      return await handler(req, res, params, url);
    }
    if (allowed) return send(res, 405, { ok: false, error: 'método não permitido nesta rota' });
    return send(res, 404, { ok: false, error: 'rota não encontrada' });
  } catch (e) {
    if (e instanceof HttpError) { if (!res.headersSent) send(res, e.status, { ok: false, error: e.message }); return; }
    log('erro', e.code || '', e.message);
    if (res.headersSent) return;
    if (/^(ECONNREFUSED|ER_ACCESS_DENIED_ERROR|ER_BAD_DB_ERROR|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|HANDSHAKE_SSL_ERROR|HANDSHAKE_NO_SSL_SUPPORT|ER_SECURE_TRANSPORT_REQUIRED)$/.test(e.code || '')) { log('banco indisponível', e.code, '(confira se o MySQL está rodando e o TLS: DB_SSL_CA e o certificado em db/tls/)'); return send(res, 503, { ok: false, error: 'Serviço temporariamente indisponível. Tente de novo em instantes.' }); }
    if (e.code === 'ER_NO_SUCH_TABLE') { log('banco sem migração (rode pnpm db:migrate)'); return send(res, 503, { ok: false, error: 'Serviço temporariamente indisponível. Tente de novo em instantes.' }); }
    send(res, 500, { ok: false, error: 'erro interno' });
  }
});

async function adminCount() {
  try {
    const [r] = await query('SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = ? AND u.active = 1 AND u.forbidden = 0', [ROLES.ADMIN]);
    return `${r.n} administrador(es) ativo(s)`;
  } catch (_) { return 'administradores: banco sem a migração 002 (rode pnpm db:migrate)'; }
}

// ex.: "gemini sem chave → deepseek ok → openrouter sem chave"
const aiSummary = () => tutorStatus().providers.map(p => `${p.id} ${p.configured ? 'ok' : 'sem chave'}`).join(' → ');

server.listen(PORT, HOST, async () => {
  const db = await ping();
  log(`API do Lance a Lance em http://${HOST}:${PORT} — IA ${aiSummary()}, banco ${db ? 'ok' : 'INDISPONÍVEL'}${db ? ', ' + await adminCount() : ` (${lastPingError}; confira se o MySQL está rodando e o TLS: DB_SSL_CA e db/tls/)`}`);
});
