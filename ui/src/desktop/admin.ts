/* ---------- Painel de administração (view admin) ---------- */
import type { ApiRole, ApiUser, IpcFail } from '../types/api';
import { $, target } from '../ui/dom';
import { esc } from '../ui/escape';
import { fmtDay } from '../ui/format';
import { busy, clearInvalid, formMsg, invalid } from '../ui/forms';
import { viewToast } from '../ui/toast';
import { ACCOUNT, EMAIL_RE, authError, renderAccount } from './account';
import { DESKTOP_ADMIN, DESKTOP_AUTH } from './bridge';
import { DEFAULT_VIEW, canView, showView } from './views';

const ADMIN = {
  q: '',
  offset: 0,
  limit: 20,
  total: 0,
  users: [] as ApiUser[],
  roles: [] as ApiRole[],
  editing: null as ApiUser | null,
  deleting: null as ApiUser | null,
  busy: false,
};
const ROLE_FALLBACK: ApiRole[] = [
  { slug: 'administrador', name: 'Administrador' },
  { slug: 'jogador', name: 'Jogador' },
];
export const roleName = (slug: string): string =>
  ((ADMIN.roles.length ? ADMIN.roles : ROLE_FALLBACK).find((r) => r.slug === slug) || { name: slug }).name;
const admin = () => DESKTOP_ADMIN!;
// a API recusou por papel (403): confere a sessão; se a pessoa não é mais administradora, volta para o jogo
async function adminDenied(r: IpcFail | null): Promise<boolean> {
  if (!r || r.status !== 403) return false;
  const me = await DESKTOP_AUTH!.me().catch(() => null);
  if (me && me.ok) {
    ACCOUNT.user = me.user;
    renderAccount();
  }
  if (!canView('admin')) {
    showView(DEFAULT_VIEW, { replace: true });
    viewToast(r.error || 'Só administradores podem abrir o painel.');
    return true;
  }
  return false;
}
export async function adminShow(): Promise<void> {
  if (!ADMIN.roles.length) {
    const r = await admin()
      .listRoles()
      .catch(() => null);
    if (r && r.ok) ADMIN.roles = r.roles;
    else if (await adminDenied(r)) return;
  }
  loadUsers();
}
async function loadUsers(): Promise<void> {
  const msg = $('#adminMsg');
  $('#adminRows').innerHTML = `<tr><td colspan="6" class="admin-empty">Carregando…</td></tr>`;
  const r = await admin()
    .listUsers({ q: ADMIN.q, limit: ADMIN.limit, offset: ADMIN.offset })
    .catch(() => null);
  if (!r || !r.ok) {
    if (await adminDenied(r)) return;
    $('#adminRows').innerHTML = `<tr><td colspan="6" class="admin-empty">Não foi possível carregar os usuários.</td></tr>`;
    formMsg(msg, authError(r));
    return;
  }
  if (!r.users.length && ADMIN.offset > 0 && r.total > 0) {
    ADMIN.offset = Math.max(0, ADMIN.offset - ADMIN.limit);
    return loadUsers();
  }
  ADMIN.users = r.users;
  ADMIN.total = r.total;
  renderUsers();
}
function statusSelos(u: ApiUser): string {
  const out: string[] = [];
  if (u.forbidden) out.push('<span class="selo bloqueado">Bloqueado</span>');
  out.push(u.active ? '<span class="selo ativo">Ativo</span>' : '<span class="selo inativo">Inativo</span>');
  return `<span class="selos">${out.join('')}</span>`;
}
function renderUsers(): void {
  const me = ACCOUNT.user && ACCOUNT.user.id;
  $('#adminRows').innerHTML = ADMIN.users.length
    ? ADMIN.users
        .map(
          (u) => `<tr data-id="${u.id}">
      <td class="u-name">${esc(`${u.first_name} ${u.last_name}`.trim())}${u.id === me ? '<span class="you-tag">você</span>' : ''}</td>
      <td class="u-mail">${esc(u.email)}</td>
      <td><span class="selo papel ${esc(u.role)}">${esc(u.role_name || roleName(u.role))}</span></td>
      <td>${statusSelos(u)}</td>
      <td class="u-date">${esc(fmtDay(u.created_at))}</td>
      <td><span class="u-acts">
        <button class="btn" data-act="edit">Editar</button>
        <button class="btn" data-act="active">${u.active ? 'Desativar' : 'Ativar'}</button>
        <button class="btn" data-act="forbidden">${u.forbidden ? 'Desbloquear' : 'Bloquear'}</button>
        <button class="btn danger" data-act="delete">Excluir</button>
      </span></td>
    </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="admin-empty">${ADMIN.q ? 'Nenhum usuário encontrado para essa busca.' : 'Nenhum usuário cadastrado.'}</td></tr>`;
  const from = ADMIN.total ? ADMIN.offset + 1 : 0,
    to = ADMIN.offset + ADMIN.users.length;
  $('#adminCount').textContent = ADMIN.total ? `${from}–${to} de ${ADMIN.total} usuário${ADMIN.total === 1 ? '' : 's'}` : '';
  $<HTMLButtonElement>('#adminPrev').disabled = ADMIN.offset <= 0;
  $<HTMLButtonElement>('#adminNext').disabled = to >= ADMIN.total;
}
// a pessoa logada mudou o próprio cadastro pelo painel: atualiza o avatar e a sessão guardada
async function refreshSelf(u: ApiUser): Promise<void> {
  if (!ACCOUNT.user || u.id !== ACCOUNT.user.id) return;
  const me = await DESKTOP_AUTH!.me().catch(() => null);
  ACCOUNT.user = me && me.ok ? me.user : u;
  renderAccount();
}
function replaceUser(u: ApiUser): void {
  const i = ADMIN.users.findIndex((x) => x.id === u.id);
  if (i >= 0) ADMIN.users[i] = u;
  renderUsers();
}
async function toggleUser(u: ApiUser, field: 'active' | 'forbidden', btn: HTMLButtonElement): Promise<void> {
  const value = field === 'active' ? !u.active : !u.forbidden;
  busy(btn, true, '…');
  const r = await admin()
    .updateUser(u.id, { [field]: value })
    .catch(() => null);
  busy(btn, false);
  if (!r || !r.ok) {
    if (!(await adminDenied(r))) formMsg($('#adminMsg'), authError(r));
    return;
  }
  replaceUser(r.user);
  refreshSelf(r.user);
  const nm = `${r.user.first_name} ${r.user.last_name}`.trim();
  formMsg(
    $('#adminMsg'),
    field === 'active' ? `${nm}: conta ${value ? 'ativada' : 'desativada'}.` : `${nm}: conta ${value ? 'bloqueada' : 'desbloqueada'}.`,
    'ok',
  );
}

/* Novo usuário / editar usuário (mesmo modal) */
let adminReturnFocus: HTMLElement | null = null;
function openUserModal(u: ApiUser | null): void {
  ADMIN.editing = u || null;
  adminReturnFocus = document.activeElement as HTMLElement | null;
  const form = $<HTMLFormElement>('#adminUserForm');
  form.reset();
  clearInvalid(form);
  $('#adminUserTtl').textContent = u ? 'Editar usuário' : 'Novo usuário';
  $('#adminUserSave').textContent = u ? 'Salvar alterações' : 'Criar usuário';
  $('#auRole').innerHTML = (ADMIN.roles.length ? ADMIN.roles : ROLE_FALLBACK)
    .map((r) => `<option value="${esc(r.slug)}">${esc(r.name)}</option>`)
    .join('');
  $<HTMLSelectElement>('#auRole').value = u ? u.role : 'jogador';
  $<HTMLInputElement>('#auFirst').value = u ? u.first_name : '';
  $<HTMLInputElement>('#auLast').value = u ? u.last_name : '';
  $<HTMLInputElement>('#auEmail').value = u ? u.email : '';
  $('#auPassHint').textContent = u ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 8 caracteres';
  $('#auFlags').hidden = !u;
  $<HTMLInputElement>('#auActive').checked = u ? u.active : true;
  $<HTMLInputElement>('#auForbidden').checked = u ? u.forbidden : false;
  formMsg($('#adminUserMsg'), '');
  $('#adminUserModal').hidden = false;
  $('#auFirst').focus();
}
function closeUserModal(): void {
  if ($('#adminUserModal').hidden) return;
  $('#adminUserModal').hidden = true;
  ADMIN.editing = null;
  if (adminReturnFocus && adminReturnFocus.isConnected) adminReturnFocus.focus();
}
/* Excluir: confirmação dentro da página (confirm() não funciona no artifact) */
function openConfirm(u: ApiUser, fromBtn: HTMLElement | null): void {
  ADMIN.deleting = u;
  adminReturnFocus = fromBtn || (document.activeElement as HTMLElement | null);
  $('#adminConfirmTxt').textContent =
    `Excluir a conta de ${`${u.first_name} ${u.last_name}`.trim()} (${u.email})? Esta ação é definitiva e não pode ser desfeita.`;
  formMsg($('#adminConfirmMsg'), '');
  $('#adminConfirmModal').hidden = false;
  $('#adminConfirmNo').focus();
}
function closeConfirm(): void {
  if ($('#adminConfirmModal').hidden) return;
  $('#adminConfirmModal').hidden = true;
  ADMIN.deleting = null;
  if (adminReturnFocus && adminReturnFocus.isConnected) adminReturnFocus.focus();
}

export function initAdmin(): void {
  $('#adminRows').onclick = (e) => {
    const btn = target(e).closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    const u = ADMIN.users.find((x) => String(x.id) === (btn.closest('tr') as HTMLElement).dataset.id);
    if (!u) return;
    formMsg($('#adminMsg'), '');
    if (btn.dataset.act === 'edit') openUserModal(u);
    else if (btn.dataset.act === 'delete') openConfirm(u, btn);
    else toggleUser(u, btn.dataset.act as 'active' | 'forbidden', btn);
  };
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  $('#adminSearch').addEventListener('input', (e) => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ADMIN.q = (e.target as HTMLInputElement).value.trim();
      ADMIN.offset = 0;
      loadUsers();
    }, 300);
  });
  $('#adminReload').onclick = () => {
    formMsg($('#adminMsg'), '');
    loadUsers();
  };
  $('#adminPrev').onclick = () => {
    ADMIN.offset = Math.max(0, ADMIN.offset - ADMIN.limit);
    loadUsers();
  };
  $('#adminNext').onclick = () => {
    ADMIN.offset += ADMIN.limit;
    loadUsers();
  };
  $('#adminNew').onclick = () => {
    formMsg($('#adminMsg'), '');
    openUserModal(null);
  };
  $('#adminUserClose').onclick = closeUserModal;
  $('#adminUserCancel').onclick = closeUserModal;
  $('#adminUserModal').addEventListener('pointerdown', (e) => {
    if (target(e).id === 'adminUserModal') closeUserModal();
  });
  $<HTMLFormElement>('#adminUserForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement,
      msg = $('#adminUserMsg'),
      btn = $<HTMLButtonElement>('#adminUserSave'),
      u = ADMIN.editing;
    clearInvalid(form);
    const val = (s: string) => $<HTMLInputElement>(s).value;
    const first = val('#auFirst').trim(),
      last = val('#auLast').trim(),
      email = val('#auEmail').trim(),
      pass = val('#auPass'),
      role = $<HTMLSelectElement>('#auRole').value;
    if (!first) return invalid(msg, $('#auFirst'), 'Informe o nome.');
    if (!last) return invalid(msg, $('#auLast'), 'Informe o sobrenome.');
    if (!EMAIL_RE.test(email)) return invalid(msg, $('#auEmail'), 'Esse e-mail não parece válido.');
    if ((!u || pass) && pass.length < 8) return invalid(msg, $('#auPass'), 'A senha precisa ter pelo menos 8 caracteres.');
    let data: Record<string, string | boolean>;
    if (!u) data = { first_name: first, last_name: last, email, password: pass, role };
    else {
      data = {};
      if (first !== u.first_name) data.first_name = first;
      if (last !== u.last_name) data.last_name = last;
      if (email.toLowerCase() !== u.email) data.email = email;
      if (pass) data.password = pass;
      if (role !== u.role) data.role = role;
      const active = $<HTMLInputElement>('#auActive').checked,
        forbidden = $<HTMLInputElement>('#auForbidden').checked;
      if (active !== u.active) data.active = active;
      if (forbidden !== u.forbidden) data.forbidden = forbidden;
      if (!Object.keys(data).length) {
        formMsg(msg, 'Nada mudou neste usuário.', 'info');
        return;
      }
    }
    formMsg(msg, '');
    busy(btn, true, 'Salvando…');
    const r = await (u ? admin().updateUser(u.id, data) : admin().createUser(data)).catch(() => null);
    busy(btn, false);
    if (!r || !r.ok) {
      if (await adminDenied(r)) {
        closeUserModal();
        return;
      }
      formMsg(msg, authError(r));
      if (r && /e-mail/i.test(r.error || '')) $('#auEmail').setAttribute('aria-invalid', 'true');
      if (r && /senha/i.test(r.error || '')) $('#auPass').setAttribute('aria-invalid', 'true');
      return;
    }
    closeUserModal();
    const nm = `${r.user.first_name} ${r.user.last_name}`.trim();
    if (u) {
      replaceUser(r.user);
      refreshSelf(r.user);
      formMsg($('#adminMsg'), `${nm}: alterações salvas.`, 'ok');
    } else {
      formMsg($('#adminMsg'), `${nm} foi criado como ${roleName(r.user.role).toLowerCase()}.`, 'ok');
      loadUsers();
    }
  };
  $('#adminConfirmNo').onclick = closeConfirm;
  $('#adminConfirmModal').addEventListener('pointerdown', (e) => {
    if (target(e).id === 'adminConfirmModal') closeConfirm();
  });
  $('#adminConfirmYes').onclick = async () => {
    const u = ADMIN.deleting,
      btn = $<HTMLButtonElement>('#adminConfirmYes');
    if (!u) return;
    busy(btn, true, 'Excluindo…');
    const r = await admin()
      .deleteUser(u.id)
      .catch(() => null);
    busy(btn, false);
    if (!r || !r.ok) {
      if (await adminDenied(r)) {
        closeConfirm();
        return;
      }
      formMsg($('#adminConfirmMsg'), authError(r));
      return;
    }
    closeConfirm();
    formMsg($('#adminMsg'), `A conta de ${`${u.first_name} ${u.last_name}`.trim()} foi excluída.`, 'ok');
    loadUsers();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#adminConfirmModal').hidden) {
      e.preventDefault();
      closeConfirm();
    } else if (!$('#adminUserModal').hidden) {
      e.preventDefault();
      closeUserModal();
    }
  });
}
