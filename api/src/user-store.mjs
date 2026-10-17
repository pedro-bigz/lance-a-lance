// Acesso às tabelas users e roles e validação dos campos. Nada daqui devolve o hash da senha para fora da API.
// As funções que escrevem aceitam um "db" opcional ({query}) para rodar dentro de uma transação (db.transaction).
// O id numérico (users.id) é só interno; para fora da API a conta é identificada pelo uuid (veja uuid.mjs).
import { query } from './db.mjs';
import { fail } from './http.mjs';
import { ROLES } from './config.mjs';
import { hashPassword } from './security.mjs';
import { uuidv7, isUuid, toBin, fromBin } from './uuid.mjs';

const POOL = { query };
const COLS = 'u.id, u.uuid, u.first_name, u.last_name, u.email, u.password, u.role_id, r.slug AS role, r.name AS role_name, u.active, u.forbidden, u.created_at, u.updated_at';
const FROM = 'users u JOIN roles r ON r.id = u.role_id';
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const iso = (d) => d instanceof Date ? d.toISOString() : d;

// o que pode sair da API: sem o campo password e sem o id interno (o "id" público é o uuid)
export const publicId = (u) => fromBin(u.uuid);
export function publicUser(u) {
  if (!u) return null;
  return {
    id: publicId(u), first_name: u.first_name, last_name: u.last_name, email: u.email,
    role: u.role, role_name: u.role_name,
    active: !!u.active, forbidden: !!u.forbidden,
    created_at: iso(u.created_at), updated_at: iso(u.updated_at),
  };
}

export const isAdmin = (u) => !!u && u.role === ROLES.ADMIN;
// administrador que consegue entrar (ativo e não bloqueado)
export const isActiveAdmin = (u) => isAdmin(u) && !!u.active && !u.forbidden;

export async function findById(id, db = POOL) {
  const rows = await db.query(`SELECT ${COLS} FROM ${FROM} WHERE u.id = ?`, [id]);
  return rows[0] || null;
}
// uuid vindo de fora (rota, query string, JWT); formato inválido é o mesmo que não existir
export async function findByUuid(uuid, db = POOL) {
  if (!isUuid(uuid)) return null;
  const rows = await db.query(`SELECT ${COLS} FROM ${FROM} WHERE u.uuid = ?`, [toBin(uuid)]);
  return rows[0] || null;
}
export async function findByEmail(email, db = POOL) {
  const rows = await db.query(`SELECT ${COLS} FROM ${FROM} WHERE u.email = ?`, [email]);
  return rows[0] || null;
}

export async function listUsers({ q = '', limit = 50, offset = 0 } = {}) {
  const where = q ? 'WHERE u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR CONCAT(u.first_name, \' \', u.last_name) LIKE ?' : '';
  const like = `%${q.replace(/[\\%_]/g, c => '\\' + c)}%`;
  const params = q ? [like, like, like, like] : [];
  const rows = await query(`SELECT ${COLS} FROM ${FROM} ${where} ORDER BY u.id LIMIT ${limit} OFFSET ${offset}`, params);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
  return { users: rows.map(publicUser), total: Number(total), limit, offset };
}

// ids dos administradores ativos, travando as linhas até o fim da transação: duas requisições
// simultâneas (ex.: dois administradores rebaixando um ao outro) não deixam o sistema sem nenhum
export async function lockActiveAdminIds(db) {
  const rows = await db.query(
    `SELECT u.id FROM ${FROM} WHERE r.slug = ? AND u.active = 1 AND u.forbidden = 0 FOR UPDATE`, [ROLES.ADMIN]);
  return rows.map(r => String(r.id));
}

// ---------- Papéis ----------
export async function listRoles() {
  // o papel sai só pelo slug (o id da tabela é interno)
  const rows = await query('SELECT slug, name, created_at FROM roles ORDER BY id');
  return rows.map(r => ({ slug: r.slug, name: r.name, created_at: iso(r.created_at) }));
}
// slug → id; papel desconhecido é 422
export async function roleId(slug, db = POOL) {
  const rows = await db.query('SELECT id FROM roles WHERE slug = ?', [slug]);
  if (!rows[0]) fail(422, `Papel inválido. Use ${Object.values(ROLES).join(' ou ')}.`);
  return rows[0].id;
}

// ---------- Validação ----------
function name(v, label) {
  if (typeof v !== 'string' || !v.trim()) fail(422, `Informe o ${label}.`);
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > 100) fail(422, `O ${label} pode ter no máximo 100 caracteres.`);
  return s;
}
export function email(v) {
  if (typeof v !== 'string' || !v.trim()) fail(422, 'Informe o e-mail.');
  const s = v.trim().toLowerCase();
  if (s.length > 255 || !EMAIL_RE.test(s)) fail(422, 'E-mail inválido.');
  return s;
}
export function password(v, label = 'A senha') {
  if (typeof v !== 'string' || !v) fail(422, `${label} é obrigatória.`);
  if (v.length < MIN_PASSWORD) fail(422, `${label} precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  if (v.length > MAX_PASSWORD) fail(422, `${label} pode ter no máximo ${MAX_PASSWORD} caracteres.`);
  return v;
}
function flag(v, label) {
  if (v === true || v === 1) return 1;
  if (v === false || v === 0) return 0;
  fail(422, `${label} deve ser true ou false.`);
}
function role(v) {
  if (typeof v !== 'string' || !v.trim()) fail(422, 'Informe o papel.');
  return v.trim().toLowerCase();
}

// campos aceitos ao criar e ao editar; "allow" diz quais o chamador pode mexer.
// role sai daqui como slug; createUser/updateUser trocam pelo role_id.
const FIELDS = {
  first_name: v => name(v, 'nome'),
  last_name: v => name(v, 'sobrenome'),
  email,
  role,
  active: v => flag(v, 'active'),
  forbidden: v => flag(v, 'forbidden'),
};

export function pickChanges(body, allow) {
  const out = {};
  for (const k of allow) if (body[k] !== undefined) out[k] = FIELDS[k](body[k]);
  return out;
}

export function rejectUnknown(body, allowed) {
  const extra = Object.keys(body).filter(k => !allowed.includes(k));
  if (extra.length) fail(422, `Campo não permitido: ${extra.join(', ')}.`);
}

const dupEmail = (e) => { if (e.code === 'ER_DUP_ENTRY') fail(409, 'Já existe uma conta com este e-mail.'); throw e; };

// ---------- Escrita ----------
// sem "role", a conta nasce jogadora (é o caso do cadastro público)
export async function createUser({ first_name, last_name, email: mail, password: plain, role: slug = ROLES.PLAYER, active = 1, forbidden = 0 }) {
  const rid = await roleId(slug);
  const hash = await hashPassword(plain);
  try {
    const r = await query('INSERT INTO users (uuid, first_name, last_name, email, password, role_id, active, forbidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [toBin(uuidv7()), first_name, last_name, mail, hash, rid, active, forbidden]);
    return findById(r.insertId);
  } catch (e) { dupEmail(e); }
}

// changes: campos já validados (role como slug); newPassword (texto) vira hash aqui
export async function updateUser(id, changes, newPassword, db = POOL) {
  const sets = [], params = [];
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'role') { sets.push('role_id = ?'); params.push(await roleId(v, db)); }
    else { sets.push(`${k} = ?`); params.push(v); }
  }
  if (newPassword) { sets.push('password = ?'); params.push(await hashPassword(newPassword)); }
  if (sets.length) {
    try { await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]); } catch (e) { dupEmail(e); }
  }
  return findById(id, db);
}

// exclusão definitiva. Tabelas que apontarem para users.id precisam de ON DELETE CASCADE ou SET NULL
// (veja o README); uma FK sem isso faz o DELETE falhar com ER_ROW_IS_REFERENCED.
// Antes, apaga as partidas em que esta conta é o único usuário (contra bot, análise): com o SET NULL das FKs
// elas ficariam sem dono. Partidas contra outro usuário ficam, com o lado desta conta vazio.
export async function deleteUser(id, db = POOL) {
  try {
    // dois DELETEs, um por lado: com o OR entre white_user_id e black_user_id o MySQL varre a tabela inteira (EXPLAIN:
    // type ALL) e, dentro da transação, trava todas as linhas de games; separados, cada um usa o índice do seu lado
    await db.query('DELETE FROM games WHERE white_user_id = ? AND (black_user_id IS NULL OR black_user_id = ?)', [id, id]);
    await db.query('DELETE FROM games WHERE black_user_id = ? AND white_user_id IS NULL', [id]);
    const r = await db.query('DELETE FROM users WHERE id = ?', [id]);
    return r.affectedRows > 0;
  } catch (e) {
    if (/^ER_ROW_IS_REFERENCED/.test(e.code || '')) fail(409, 'Esta conta tem registros ligados a ela e não pode ser excluída. Desative-a em vez disso.');
    throw e;
  }
}
