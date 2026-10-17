'use strict';
// Processo principal do Lance a Lance (Electron).
// Serve a interface pelo protocolo app:// para que o Stockfish rode num Web Worker de mesma origem,
// coisa que o file:// não permite.
const { app, BrowserWindow, protocol, net, shell, nativeTheme, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_DIR = path.join(__dirname, 'app');
const HOST = 'lance';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function serveApp() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(APP_DIR, rel));
    // impede sair da pasta do app (../)
    if (file !== APP_DIR && !file.startsWith(APP_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- API (contas e tutor de IA) ----------
// O app não guarda nenhuma chave de IA (Gemini, DeepSeek, OpenRouter): toda conversa vai para a API (pasta api/), que tem a
// chaves no próprio .env e exige login. O endereço da API vem do .env do app, empacotado junto com ele.
function loadEnv(file) {
  const out = {};
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return out; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
const ENV = loadEnv(path.join(__dirname, '.env'));
const API_URL = process.env.LANCE_API_URL || ENV.LANCE_API_URL || 'http://127.0.0.1:8787';
// versões anteriores guardavam a chave do DeepSeek (1.15) ou o endereço da API (1.16) no app
function removeOldConfig() {
  for (const f of ['deepseek-key.bin', 'tutor-api.json']) { try { fs.unlinkSync(path.join(app.getPath('userData'), f)); } catch (_) {} }
}
function fromApp(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return typeof url === 'string' && url.startsWith(`app://${HOST}/`);
}

// ---------- Sessão ----------
// O token JWT fica só aqui no processo principal: em memória e, para lembrar o login entre aberturas,
// cifrado com o safeStorage (chaveiro do sistema) em userData/session.bin. A página só recebe os dados
// públicos do usuário; nunca o token nem a senha.
const SESSION_FILE = () => path.join(app.getPath('userData'), 'session.bin');
let session = null; // {token, user}
// usuário de uma versão anterior (id numérico), guardado até o login dessa mesma conta: a página usa o id antigo
// uma única vez para levar a partida aberta e a fila local para as chaves novas (por uuid). Fica só neste computador.
let legacy = null; // {id, email}
// ids de usuário e de partida na API: UUID no formato canônico (minúsculo, com hífens)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function jwtExp(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).exp || 0; } catch (_) { return 0; }
}
const tokenAlive = (token) => jwtExp(token) * 1000 > Date.now();

function loadSession() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const data = JSON.parse(safeStorage.decryptString(fs.readFileSync(SESSION_FILE())));
    if (data && data.legacy && /^\d{1,19}$/.test(String(data.legacy.id))) legacy = { id: String(data.legacy.id), email: String(data.legacy.email || '') };
    // sessão de antes dos uuids: a API não aceita mais esse token; guarda o id antigo e pede login de novo
    const u = data && data.user;
    if (u && /^\d{1,19}$/.test(String(u.id))) legacy = { id: String(u.id), email: String(u.email || '').toLowerCase() };
    if (data && typeof data.token === 'string' && tokenAlive(data.token) && u && isUuid(u.id)) session = { token: data.token, user: u };
    else clearSession();
  } catch (_) { session = null; }
}
function saveSession() {
  if (!session) return;
  try {
    // sem cifra disponível o login vale só até fechar o app (não gravamos o token em texto)
    if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(SESSION_FILE(), safeStorage.encryptString(JSON.stringify({ ...session, legacy })), { mode: 0o600 });
  } catch (_) {}
}
function clearSession() {
  session = null;
  try {
    if (legacy && safeStorage.isEncryptionAvailable()) fs.writeFileSync(SESSION_FILE(), safeStorage.encryptString(JSON.stringify({ legacy })), { mode: 0o600 });
    else fs.unlinkSync(SESSION_FILE());
  } catch (_) {}
}
// no login da mesma conta (mesmo e-mail), entrega o id antigo uma vez e esquece
function takeLegacy(user) {
  if (!legacy || !user || String(user.email || '').toLowerCase() !== legacy.email) return undefined;
  const id = legacy.id;
  legacy = null;
  return id;
}
// sessão recusada pela API (expirada, conta desativada ou bloqueada): desloga e avisa a página
function expireSession(message) {
  if (!session) return;
  clearSession();
  if (win && !win.isDestroyed()) win.webContents.send('auth:expired', { message: message || 'Sua sessão expirou. Entre de novo.' });
}

async function callApi(route, init = {}, ms = 125000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await net.fetch(new URL(route, API_URL).toString(), {
      ...init, signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { httpStatus: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}
// chamada com o token da sessão; 401/403 encerram a sessão (o app só usa rotas do próprio usuário)
async function callAuthed(route, init = {}, ms) {
  if (!session) return { httpStatus: 401, data: { ok: false, error: 'Faça login para continuar.' } };
  const r = await callApi(route, { ...init, token: session.token }, ms);
  if (r.httpStatus === 401 || r.httpStatus === 403) expireSession(r.data && r.data.error);
  return r;
}
// mensagem para o usuário: sem endereço do servidor nem instruções de quem administra a API
const offlineError = (e) => e && e.name === 'AbortError' ? 'O servidor demorou demais para responder. Tente de novo.' : 'Não foi possível conectar ao servidor. Confira sua conexão e tente de novo.';
const apiError = (r) => (r.data && r.data.error) || `erro ${r.httpStatus}`;
const str = (v, max = 300) => typeof v === 'string' ? v.slice(0, max) : undefined;

function registerAuth() {
  loadSession();
  const start = async (route, body) => {
    try {
      const r = await callApi(route, { method: 'POST', body: JSON.stringify(body) }, 15000);
      if (r.data && r.data.ok && r.data.token && r.data.user && isUuid(r.data.user.id)) {
        session = { token: r.data.token, user: r.data.user };
        const legacyId = takeLegacy(r.data.user);
        saveSession();
        return { ok: true, user: r.data.user, ...(legacyId ? { legacyId } : {}) };
      }
      return { ok: false, status: r.httpStatus, error: apiError(r) };
    } catch (e) {
      return { ok: false, status: 0, error: offlineError(e) };
    }
  };
  ipcMain.handle('auth:login', async (event, p) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    return start('/v1/auth/login', { email: str(p && p.email), password: str(p && p.password) });
  });
  ipcMain.handle('auth:register', async (event, p) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    return start('/v1/auth/register', { first_name: str(p && p.first_name), last_name: str(p && p.last_name), email: str(p && p.email), password: str(p && p.password) });
  });
  ipcMain.handle('auth:me', async (event) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    if (!session) return { ok: false, status: 401 };
    if (!tokenAlive(session.token)) { clearSession(); return { ok: false, status: 401, error: 'Sua sessão expirou. Entre de novo.' }; }
    try {
      const r = await callApi('/v1/auth/me', { method: 'GET', token: session.token }, 6000);
      if (r.data && r.data.ok) { session.user = r.data.user; saveSession(); return { ok: true, user: r.data.user }; }
      // 401 inclui o token de antes dos uuids (sub numérico): cai no login
      if (r.httpStatus === 401 || r.httpStatus === 403) { clearSession(); return { ok: false, status: r.httpStatus, error: apiError(r) }; }
      return { ok: false, status: r.httpStatus, error: apiError(r) };
    } catch (e) {
      // API fora do ar: com token ainda válido, entra com os dados guardados (o tutor fica indisponível)
      if (session.user) return { ok: true, user: session.user, offline: true };
      return { ok: false, status: 0, error: offlineError(e) };
    }
  });
  ipcMain.handle('auth:logout', async (event) => {
    if (!fromApp(event)) return { ok: false };
    clearSession();
    return { ok: true };
  });
  ipcMain.handle('users:update-me', async (event, p) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    const body = {};
    for (const k of ['first_name', 'last_name', 'email', 'password', 'current_password']) { const v = str(p && p[k]); if (v !== undefined && v !== '') body[k] = v; }
    try {
      const r = await callAuthed('/v1/users/me', { method: 'PATCH', body: JSON.stringify(body) }, 15000);
      if (r.data && r.data.ok) { if (session) { session.user = r.data.user; saveSession(); } return { ok: true, user: r.data.user, passwordChanged: !!r.data.password_changed }; }
      return { ok: false, status: r.httpStatus, error: apiError(r) };
    } catch (e) {
      return { ok: false, status: 0, error: offlineError(e) };
    }
  });
}

// ---------- Administração (só administradores; a API confere o papel em toda chamada) ----------
// callAdmin também serve às partidas e estatísticas. Aqui um 403 pode ser só "você não é administrador": nesse caso a sessão continua. Para saber se a
// própria conta foi desativada ou bloqueada, confere /v1/auth/me antes de deslogar.
async function callAdmin(route, init = {}) {
  if (!session) return { httpStatus: 401, data: { ok: false, error: 'Faça login para continuar.' } };
  const r = await callApi(route, { ...init, token: session.token }, 15000);
  if (r.httpStatus === 401) expireSession(r.data && r.data.error);
  else if (r.httpStatus === 403) {
    const me = await callApi('/v1/auth/me', { method: 'GET', token: session.token }, 6000).catch(() => null);
    if (me && (me.httpStatus === 401 || me.httpStatus === 403)) expireSession(me.data && me.data.error);
    else if (me && me.data && me.data.ok && session) { session.user = me.data.user; saveSession(); }
  }
  return r;
}
// id de usuário ou de partida vindo da página: só UUID; qualquer outra coisa (inclusive número) é recusada aqui
const apiId = (v) => isUuid(v) ? v : null;
const ADMIN_USER_FIELDS = ['first_name', 'last_name', 'email', 'password', 'role'];
function adminUserBody(p) {
  const body = {};
  for (const k of ADMIN_USER_FIELDS) { const v = str(p && p[k]); if (v !== undefined && v !== '') body[k] = v; }
  for (const k of ['active', 'forbidden']) if (p && typeof p[k] === 'boolean') body[k] = p[k];
  return body;
}

function registerAdmin() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    try {
      const out = await fn(...args);
      if (out.bad) return { ok: false, status: 422, error: out.bad };
      const r = await callAdmin(out.route, out.init);
      if (r.data && r.data.ok) return { ok: true, ...r.data };
      return { ok: false, status: r.httpStatus, error: apiError(r) };
    } catch (e) {
      return { ok: false, status: 0, error: offlineError(e) };
    }
  });
  handle('admin:list-users', (p) => {
    const qs = new URLSearchParams();
    const q = str(p && p.q, 100); if (q) qs.set('q', q);
    for (const k of ['limit', 'offset']) { const n = p && p[k]; if (Number.isSafeInteger(n) && n >= 0) qs.set(k, String(n)); }
    return { route: `/v1/users${qs.toString() ? '?' + qs : ''}`, init: { method: 'GET' } };
  });
  handle('admin:get-user', (id) => apiId(id) ? { route: `/v1/users/${apiId(id)}`, init: { method: 'GET' } } : { bad: 'Usuário inválido.' });
  handle('admin:create-user', (p) => ({ route: '/v1/users', init: { method: 'POST', body: JSON.stringify(adminUserBody(p)) } }));
  handle('admin:update-user', (id, p) => apiId(id) ? { route: `/v1/users/${apiId(id)}`, init: { method: 'PATCH', body: JSON.stringify(adminUserBody(p)) } } : { bad: 'Usuário inválido.' });
  handle('admin:delete-user', (id) => apiId(id) ? { route: `/v1/users/${apiId(id)}`, init: { method: 'DELETE' } } : { bad: 'Usuário inválido.' });
  handle('admin:list-roles', () => ({ route: '/v1/roles', init: { method: 'GET' } }));
}

// ---------- Partidas e estatísticas (sempre do usuário logado) ----------
// Mesmo cuidado das rotas de administração: um 403 (ex.: ?user_id= de outra pessoa) só desloga se a própria conta
// foi desativada ou bloqueada. O corpo da partida vai como está (a API valida cada campo), com limite de tamanho.
const GAME_FIELDS = ['client_ref', 'opponent_type', 'bot_level', 'color', 'mode', 'rated', 'status', 'result', 'result_reason',
  'start_fen', 'started_at', 'pgn', 'moves', 'meta', 'opening_name'];
const MAX_GAME_BODY = 250 * 1024;
function gameBody(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { bad: 'Dados da partida inválidos.' };
  const body = {};
  for (const k of GAME_FIELDS) if (p[k] !== undefined) body[k] = p[k];
  const json = JSON.stringify(body);
  if (json.length > MAX_GAME_BODY) return { bad: 'Partida grande demais para salvar.' };
  return { json };
}
function queryString(p, spec) {
  const qs = new URLSearchParams();
  for (const [k, re] of Object.entries(spec)) {
    const v = p && p[k];
    if (v == null || v === '') continue;
    const sv = String(v);
    if (re.test(sv)) qs.set(k, sv);
  }
  const s = qs.toString();
  return s ? '?' + s : '';
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

function registerGames() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    try {
      const out = fn(...args);
      if (out.bad) return { ok: false, status: 422, error: out.bad };
      const r = await callAdmin(out.route, out.init);
      if (r.data && r.data.ok) return { ok: true, ...r.data };
      return { ok: false, status: r.httpStatus, error: apiError(r) };
    } catch (e) {
      return { ok: false, status: 0, error: offlineError(e) };
    }
  });
  const withBody = (route, method, p) => { const b = gameBody(p); return b.bad ? b : { route, init: { method, body: b.json } }; };
  handle('games:create', (p) => withBody('/v1/games', 'POST', p));
  handle('games:update', (id, p) => apiId(id) ? withBody(`/v1/games/${apiId(id)}`, 'PATCH', p) : { bad: 'Partida inválida.' });
  handle('games:get', (id) => apiId(id) ? { route: `/v1/games/${apiId(id)}`, init: { method: 'GET' } } : { bad: 'Partida inválida.' });
  handle('games:delete', (id) => apiId(id) ? { route: `/v1/games/${apiId(id)}`, init: { method: 'DELETE' } } : { bad: 'Partida inválida.' });
  handle('games:list', (p) => ({ route: '/v1/games' + queryString(p, { status: /^(em_andamento|concluida|abandonada)$/, limit: /^\d{1,3}$/, offset: /^\d{1,9}$/, user_id: UUID_RE }), init: { method: 'GET' } }));
  handle('stats:me', (p) => ({ route: '/v1/stats/me' + queryString(p, { user_id: UUID_RE }), init: { method: 'GET' } }));
  handle('stats:rating-history', (p) => ({ route: '/v1/stats/me/rating-history' + queryString(p, { from: DATE_RE, to: DATE_RE, group: /^(day|week|month)$/, tz: /^-?\d{1,3}$/, user_id: UUID_RE }), init: { method: 'GET' } }));
}

function registerAi() {
  removeOldConfig();
  ipcMain.handle('ai:status', async (event) => {
    if (!fromApp(event)) return { reachable: false };
    try {
      const r = await callApi('/health', { method: 'GET' }, 4000);
      return { reachable: r.httpStatus === 200, ai: r.data && r.data.ai };
    } catch (_) {
      return { reachable: false };
    }
  });
  ipcMain.handle('ai:chat', async (event, payload) => {
    if (!fromApp(event)) return { ok: false, status: 0, error: 'origem inválida' };
    const body = JSON.stringify({ messages: payload && payload.messages, tools: payload && payload.tools });
    if (body.length > 400000) return { ok: false, status: 413, error: 'Conversa grande demais.' };
    try {
      const r = await callAuthed('/v1/tutor/chat', { method: 'POST', body });
      if (r.data && r.data.ok) return { ok: true, message: r.data.message, finish: r.data.finish, provider: r.data.provider, providerName: r.data.provider_name };
      return { ok: false, status: r.httpStatus, error: apiError(r) };
    } catch (e) {
      return { ok: false, status: 0, error: e.name === 'AbortError' ? 'O tutor demorou demais para responder.' : 'Não foi possível conectar ao tutor.' };
    }
  });
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 420,
    minHeight: 600,
    title: 'Lance a Lance',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141716' : '#f4f6f5',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => win.show());

  // links externos abrem no navegador do sistema; o app nunca navega para fora de app://
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`app://${HOST}/`)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(`app://${HOST}/index.html`);
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  serveApp();
  registerAuth();
  registerAdmin();
  registerGames();
  registerAi();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
