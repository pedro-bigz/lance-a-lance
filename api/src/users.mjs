// Módulo de usuários: o próprio perfil (qualquer usuário logado) e a gestão de contas e papéis (administradores).
import { fail, readJson, send } from './http.mjs';
import { requireUser, requireAdmin } from './auth.mjs';
import { verifyPassword } from './security.mjs';
import { transaction } from './db.mjs';
import { ROLES } from './config.mjs';
import * as store from './user-store.mjs';
import { isUuid } from './uuid.mjs';

const SELF_FIELDS = ['first_name', 'last_name', 'email', 'password', 'current_password'];
const ADMIN_FIELDS = ['first_name', 'last_name', 'email', 'password', 'role', 'active', 'forbidden'];

export async function getMe(req, res) {
  const u = await requireUser(req);
  return send(res, 200, { ok: true, user: store.publicUser(u) });
}

// edita nome, sobrenome e e-mail; trocar a senha exige a senha atual
export async function patchMe(req, res) {
  const u = await requireUser(req);
  const body = await readJson(req, 16 * 1024);
  store.rejectUnknown(body, SELF_FIELDS);
  const changes = store.pickChanges(body, ['first_name', 'last_name', 'email']);
  let newPassword = null;
  if (body.password !== undefined) {
    newPassword = store.password(body.password, 'A nova senha');
    if (typeof body.current_password !== 'string' || !body.current_password) fail(422, 'Informe a senha atual para trocar a senha.');
    if (!(await verifyPassword(body.current_password, u.password))) fail(422, 'A senha atual está incorreta.');
  }
  if (!Object.keys(changes).length && !newPassword) fail(422, 'Nada para alterar.');
  const updated = await store.updateUser(u.id, changes, newPassword);
  return send(res, 200, { ok: true, user: store.publicUser(updated), password_changed: !!newPassword });
}

function intParam(v, def, min, max) {
  if (v == null || v === '') return def;
  if (!/^\d+$/.test(v)) fail(400, 'Parâmetro numérico inválido.');
  return Math.min(max, Math.max(min, Number(v)));
}
// :id da rota é o uuid; formato inválido e conta inexistente dão o mesmo 404
async function findTarget(raw, db) {
  const u = await store.findByUuid(raw, db);
  if (!u) fail(404, 'Usuário não encontrado.');
  return u;
}

export async function list(req, res, url) {
  await requireAdmin(req);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const limit = intParam(url.searchParams.get('limit'), 50, 1, 200);
  const offset = intParam(url.searchParams.get('offset'), 0, 0, 1e9);
  return send(res, 200, { ok: true, ...(await store.listUsers({ q, limit, offset })) });
}

export async function getOne(req, res, rawId) {
  await requireAdmin(req);
  const u = await findTarget(rawId);
  return send(res, 200, { ok: true, user: store.publicUser(u) });
}

export async function create(req, res) {
  await requireAdmin(req);
  const body = await readJson(req, 16 * 1024);
  store.rejectUnknown(body, ADMIN_FIELDS);
  const data = store.pickChanges(body, ['first_name', 'last_name', 'email', 'role', 'active', 'forbidden']);
  for (const [k, label] of [['first_name', 'nome'], ['last_name', 'sobrenome'], ['email', 'e-mail']]) if (!data[k]) fail(422, `Informe o ${label}.`);
  const u = await store.createUser({ ...data, password: store.password(body.password) });
  return send(res, 201, { ok: true, user: store.publicUser(u) });
}

const NO_ADMIN_LEFT = 'O sistema precisa de pelo menos um administrador ativo. Promova outra conta a administrador antes.';

// o administrador pode mudar tudo, inclusive papel, active/forbidden e redefinir a senha sem a atual.
// Proteções (409): não pode desativar, bloquear nem rebaixar a si mesmo, e o último administrador ativo
// não pode deixar de sê-lo.
export async function patch(req, res, rawId) {
  const admin = await requireAdmin(req);
  if (!isUuid(rawId)) fail(404, 'Usuário não encontrado.');
  const body = await readJson(req, 16 * 1024);
  store.rejectUnknown(body, ADMIN_FIELDS);
  const changes = store.pickChanges(body, ['first_name', 'last_name', 'email', 'role', 'active', 'forbidden']);
  const newPassword = body.password !== undefined ? store.password(body.password, 'A nova senha') : null;
  if (!Object.keys(changes).length && !newPassword) fail(422, 'Nada para alterar.');
  if (changes.role) await store.roleId(changes.role);   // papel inválido é 422 antes de qualquer outra regra
  const self = store.publicId(admin) === rawId;
  if (self && changes.active === 0) fail(409, 'Você não pode desativar a própria conta.');
  if (self && changes.forbidden === 1) fail(409, 'Você não pode bloquear a própria conta.');
  if (self && changes.role && changes.role !== ROLES.ADMIN) fail(409, 'Você não pode tirar o seu próprio papel de administrador.');
  const updated = await transaction(async (db) => {
    const admins = await store.lockActiveAdminIds(db);
    if (!admins.includes(String(admin.id))) fail(403, 'Só administradores podem fazer isso.');   // perdeu o papel no meio do caminho
    const target = await findTarget(rawId, db);
    const after = { ...target, ...changes };
    if (store.isActiveAdmin(target) && !store.isActiveAdmin(after) && !admins.some(a => a !== String(target.id))) fail(409, NO_ADMIN_LEFT);
    return store.updateUser(target.id, changes, newPassword, db);
  });
  return send(res, 200, { ok: true, user: store.publicUser(updated) });
}

// exclusão definitiva (hard delete)
export async function remove(req, res, rawId) {
  const admin = await requireAdmin(req);
  if (!isUuid(rawId)) fail(404, 'Usuário não encontrado.');
  if (store.publicId(admin) === rawId) fail(409, 'Você não pode excluir a própria conta.');
  const deleted = await transaction(async (db) => {
    const admins = await store.lockActiveAdminIds(db);
    if (!admins.includes(String(admin.id))) fail(403, 'Só administradores podem fazer isso.');   // perdeu o papel no meio do caminho
    const target = await findTarget(rawId, db);
    if (store.isActiveAdmin(target) && !admins.some(a => a !== String(target.id))) fail(409, NO_ADMIN_LEFT);
    await store.deleteUser(target.id, db);
    return target;
  });
  return send(res, 200, { ok: true, deleted: store.publicUser(deleted) });
}

export async function listRoles(req, res) {
  await requireAdmin(req);
  return send(res, 200, { ok: true, roles: await store.listRoles() });
}
