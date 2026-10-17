// Autenticação: cadastro público, login (JWT), o middleware que exige usuário logado e a autorização por papel.
import { fail, readJson, send } from './http.mjs';
import { ROLES } from './config.mjs';
import { signJwt, verifyJwt, verifyPassword, DUMMY_HASH, TOKEN_TTL } from './security.mjs';
import * as store from './user-store.mjs';
import { isUuid } from './uuid.mjs';

// barra conta desativada ou bloqueada (vale no login e em toda rota protegida)
function assertAllowed(u) {
  if (!u.active) fail(403, 'Sua conta está desativada. Fale com o administrador para reativá-la.');
  if (u.forbidden) fail(403, 'Sua conta está bloqueada. Fale com o administrador.');
}

// lê o "Authorization: Bearer <jwt>", confere assinatura e validade e carrega o usuário do banco
// (assim desativar ou bloquear a conta vale na hora, mesmo com token ainda válido)
export async function requireUser(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!m) fail(401, 'Faça login para continuar.');
  const claims = verifyJwt(m[1]);
  // sub é o uuid do usuário; token antigo (sub numérico) ou com outro formato é recusado
  if (!claims || !isUuid(claims.sub)) fail(401, 'Sessão inválida ou expirada. Entre de novo.');
  const u = await store.findByUuid(claims.sub);
  if (!u) fail(401, 'Sessão inválida ou expirada. Entre de novo.');
  assertAllowed(u);
  return u;
}

// autorização por papel: exige login (com a checagem de active/forbidden) e um dos papéis dados.
// Vale o papel gravado no banco, não o do token: rebaixar alguém tem efeito na hora.
export async function requireRole(req, ...roles) {
  const u = await requireUser(req);
  if (!roles.includes(u.role)) fail(403, roles.length === 1 && roles[0] === ROLES.ADMIN ? 'Só administradores podem fazer isso.' : 'Seu papel não permite fazer isso.');
  return u;
}
export const requireAdmin = (req) => requireRole(req, ROLES.ADMIN);

// o papel vai no token só como informação para o app; a API sempre confere no banco
function session(u) {
  return { token: signJwt({ sub: store.publicId(u), email: u.email, role: u.role }), expires_in: TOKEN_TTL, user: store.publicUser(u) };
}

const REGISTER_FIELDS = ['first_name', 'last_name', 'email', 'password'];

export async function register(req, res) {
  const body = await readJson(req, 16 * 1024);
  store.rejectUnknown(body, REGISTER_FIELDS);
  const data = store.pickChanges(body, ['first_name', 'last_name', 'email']);
  for (const [k, label] of [['first_name', 'nome'], ['last_name', 'sobrenome'], ['email', 'e-mail']]) if (!data[k]) fail(422, `Informe o ${label}.`);
  const plain = store.password(body.password);
  const u = await store.createUser({ ...data, password: plain, role: ROLES.PLAYER });   // cadastro público: jogador, já ativo
  return send(res, 201, { ok: true, ...session(u) });
}

export async function login(req, res) {
  const body = await readJson(req, 16 * 1024);
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.trim() || !body.password) fail(422, 'Informe e-mail e senha.');
  const u = await store.findByEmail(body.email.trim().toLowerCase());
  const okPass = await verifyPassword(body.password, u ? u.password : DUMMY_HASH);
  if (!u || !okPass) fail(401, 'E-mail ou senha incorretos.');
  assertAllowed(u);
  return send(res, 200, { ok: true, ...session(u) });
}

export async function me(req, res) {
  const u = await requireUser(req);
  return send(res, 200, { ok: true, user: store.publicUser(u) });
}
