/* ---------- Painel de administração (view admin): regras ----------
   Papéis, validação do formulário de usuário e o tratamento de 403. O desenho é o componente de admin-view.tsx. */
import type { ApiRole, ApiUser, IpcFail } from '../types/api';
import { viewToast } from '../ui/toast';
import { ACCOUNT, EMAIL_RE, renderAccount } from './account';
import { DESKTOP_AUTH } from './bridge';
import { DEFAULT_VIEW, canView, showView } from './views';

/** papéis da API (carregados uma vez ao abrir o painel); antes disso vale o ROLE_FALLBACK */
export const ADMIN_ROLES: { list: ApiRole[] } = { list: [] };
export const ROLE_FALLBACK: ApiRole[] = [
  { slug: 'administrador', name: 'Administrador' },
  { slug: 'jogador', name: 'Jogador' },
];
export const roleList = (): ApiRole[] => (ADMIN_ROLES.list.length ? ADMIN_ROLES.list : ROLE_FALLBACK);
export const roleName = (slug: string): string => (roleList().find((r) => r.slug === slug) || { name: slug }).name;
export const fullName = (u: Pick<ApiUser, 'first_name' | 'last_name'>): string => `${u.first_name} ${u.last_name}`.trim();

// a API recusou por papel (403): confere a sessão; se a pessoa não é mais administradora, volta para a tela inicial
export async function adminDenied(r: IpcFail | null): Promise<boolean> {
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
// a pessoa logada mudou o próprio cadastro pelo painel: atualiza o avatar e a sessão guardada
export async function refreshSelf(u: ApiUser): Promise<void> {
  if (!ACCOUNT.user || u.id !== ACCOUNT.user.id) return;
  const me = await DESKTOP_AUTH!.me().catch(() => null);
  ACCOUNT.user = me && me.ok ? me.user : u;
  renderAccount();
}

export type AdminField = 'auFirst' | 'auLast' | 'auEmail' | 'auPass';
export interface AdminFormValues {
  first: string;
  last: string;
  email: string;
  pass: string;
  role: string;
  active: boolean;
  forbidden: boolean;
}
export type FormCheck<F extends string> = { error: string; field: F } | { info: string } | { data: Record<string, string | boolean> };
/** confere o formulário de novo usuário / editar usuário e monta o corpo (na edição, só o que mudou) */
export function checkUserForm(v: AdminFormValues, editing: ApiUser | null): FormCheck<AdminField> {
  const first = v.first.trim(),
    last = v.last.trim(),
    email = v.email.trim(),
    pass = v.pass;
  if (!first) return { error: 'Informe o nome.', field: 'auFirst' };
  if (!last) return { error: 'Informe o sobrenome.', field: 'auLast' };
  if (!EMAIL_RE.test(email)) return { error: 'Esse e-mail não parece válido.', field: 'auEmail' };
  if ((!editing || pass) && pass.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.', field: 'auPass' };
  if (!editing) return { data: { first_name: first, last_name: last, email, password: pass, role: v.role } };
  const data: Record<string, string | boolean> = {};
  if (first !== editing.first_name) data.first_name = first;
  if (last !== editing.last_name) data.last_name = last;
  if (email.toLowerCase() !== editing.email) data.email = email;
  if (pass) data.password = pass;
  if (v.role !== editing.role) data.role = v.role;
  if (v.active !== editing.active) data.active = v.active;
  if (v.forbidden !== editing.forbidden) data.forbidden = v.forbidden;
  if (!Object.keys(data).length) return { info: 'Nada mudou neste usuário.' };
  return { data };
}
export function toggleMsg(u: ApiUser, field: 'active' | 'forbidden', value: boolean): string {
  const nm = fullName(u);
  return field === 'active' ? `${nm}: conta ${value ? 'ativada' : 'desativada'}.` : `${nm}: conta ${value ? 'bloqueada' : 'desbloqueada'}.`;
}
export function adminCountText(offset: number, shown: number, total: number): string {
  return total ? `${offset + 1}–${offset + shown} de ${total} usuário${total === 1 ? '' : 's'}` : '';
}
