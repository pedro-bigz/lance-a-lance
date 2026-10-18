/* ---------- Conta do usuário (só no app desktop) ----------
   O login fica no processo principal do app: a página manda e-mail e senha uma vez e recebe só os dados
   públicos do usuário; o token de acesso nunca passa por aqui.
   Estado da tela de entrada (AUTH) e da conta (ACCOUNT); o desenho é AuthScreen (desktop/auth-view.tsx) e o menu da
   conta fica na sidebar (desktop/sidebar-view.tsx). */
import { bootApp } from '../boot';
import { closePop, setMenu } from '../game/menus';
import { closeStyle } from '../board/style-picker';
import { AUTH_NOTE } from '../store/local';
import { publishShell } from '../store/view-store';
import type { ApiUser, IpcFail } from '../types/api';
import { target } from '../ui/dom';
import type { Msg } from '../react/modal';
import { DESKTOP_AUTH } from './bridge';
import { SIDEBAR, initSidebar } from './sidebar';
import { startRouter } from './views';

/** legacyId: id numérico de antes dos uuids (só no 1º login, veja migrateLegacyKeys) */
export const ACCOUNT: { user: ApiUser | null; legacyId: string | null } = { user: null, legacyId: null };
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function initials(u: ApiUser): string {
  const a = (u.first_name || '').trim()[0] || '',
    b = (u.last_name || '').trim()[0] || '';
  return (a + b || (u.email || '?')[0] || '').toUpperCase();
}
export function authError(r: Pick<IpcFail, 'status' | 'error'> | null | undefined): string {
  if (!r) return 'Não foi possível conectar ao servidor. Tente de novo.';
  if (r.status === 429) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  return r.error || `Erro ${r.status || 'desconhecido'}. Tente de novo.`;
}

export type AuthField = 'loginEmail' | 'loginPass' | 'regFirst' | 'regLast' | 'regEmail' | 'regPass' | 'regPass2';
export interface AuthState {
  /** tela de entrada visível (a área do app fica inerte) */
  visible: boolean;
  view: 'login' | 'register';
  loginMsg: Msg;
  registerMsg: Msg;
  busy: 'login' | 'register' | null;
  invalid: AuthField[];
}
export const AUTH: AuthState = { visible: false, view: 'login', loginMsg: null, registerMsg: null, busy: null, invalid: [] };
const field = (id: AuthField) => document.getElementById(id) as HTMLInputElement | null;
const focusField = (id: AuthField) => {
  const el = field(id);
  if (el) el.focus();
};

export function showAuth(view: 'login' | 'register', note?: string, kind: 'err' | 'ok' | 'info' = 'info'): void {
  document.documentElement.classList.add('needs-auth');
  const login = view !== 'register';
  AUTH.visible = true;
  AUTH.view = login ? 'login' : 'register';
  AUTH.loginMsg = { text: login ? note || '' : '', kind: login && note ? kind : 'err' };
  AUTH.registerMsg = { text: '', kind: 'err' };
  publishShell();
  focusField(login ? (field('loginEmail')?.value ? 'loginPass' : 'loginEmail') : 'regFirst');
}
/** a conta mudou (login, perfil salvo): sidebar e menu da conta redesenham */
export function renderAccount(): void {
  publishShell();
}
export function enterApp(user: ApiUser, legacyId?: string | null): void {
  ACCOUNT.user = user;
  ACCOUNT.legacyId = legacyId || null;
  AUTH.visible = false;
  AUTH.invalid = [];
  for (const f of ['loginForm', 'registerForm']) (document.getElementById(f) as HTMLFormElement | null)?.reset();
  document.documentElement.classList.remove('needs-auth');
  initSidebar();
  bootApp();
  // as telas do app (Início, Histórico, Estatísticas, Administração e o perfil) só existem com a conta; entram antes do roteamento
  publishShell();
  startRouter();
}
// sair ou perder a sessão recarrega a página: a área do jogo some, o motor para e volta o login
export function leaveApp(note: string): void {
  try {
    sessionStorage.setItem(AUTH_NOTE, note);
  } catch (_) {}
  location.reload();
}

/* Menu da conta: dropdown do avatar */
export function setUserPop(open: boolean, focusBtn?: boolean): void {
  if (!ACCOUNT.user) return;
  if (SIDEBAR.userPop !== open) {
    SIDEBAR.userPop = open;
    publishShell();
  }
  if (open) document.getElementById('userPop')?.focus();
  else if (focusBtn) document.getElementById('openUser')?.focus();
}
export function toggleUserPop(): void {
  if (SIDEBAR.userPop) {
    setUserPop(false);
    return;
  }
  closePop(false);
  closeStyle(false);
  setMenu(false);
  setUserPop(true);
}

function invalid(form: 'login' | 'register', id: AuthField, text: string): void {
  AUTH[form === 'login' ? 'loginMsg' : 'registerMsg'] = { text, kind: 'err' };
  AUTH.invalid = [id];
  publishShell();
  focusField(id);
}
export function switchAuth(view: 'login' | 'register'): void {
  showAuth(view);
}
export async function submitLogin(): Promise<void> {
  const auth = DESKTOP_AUTH;
  AUTH.invalid = [];
  const email = (field('loginEmail')?.value || '').trim(),
    password = field('loginPass')?.value || '';
  if (!email) return invalid('login', 'loginEmail', 'Informe o e-mail.');
  if (!EMAIL_RE.test(email)) return invalid('login', 'loginEmail', 'Esse e-mail não parece válido.');
  if (!password) return invalid('login', 'loginPass', 'Informe a senha.');
  AUTH.loginMsg = { text: '', kind: 'err' };
  AUTH.busy = 'login';
  publishShell();
  const r = await auth!.login({ email, password }).catch(() => null);
  AUTH.busy = null;
  if (r && r.ok) {
    enterApp(r.user, r.legacyId);
    return;
  }
  AUTH.loginMsg = { text: authError(r), kind: 'err' };
  publishShell();
  const pass = field('loginPass');
  if (pass) {
    pass.value = '';
    pass.focus();
  }
}
export async function submitRegister(): Promise<void> {
  const auth = DESKTOP_AUTH;
  AUTH.invalid = [];
  const val = (id: AuthField) => field(id)?.value || '';
  const data = {
    first_name: val('regFirst').trim(),
    last_name: val('regLast').trim(),
    email: val('regEmail').trim(),
    password: val('regPass'),
  };
  if (!data.first_name) return invalid('register', 'regFirst', 'Informe o nome.');
  if (!data.last_name) return invalid('register', 'regLast', 'Informe o sobrenome.');
  if (!data.email) return invalid('register', 'regEmail', 'Informe o e-mail.');
  if (!EMAIL_RE.test(data.email)) return invalid('register', 'regEmail', 'Esse e-mail não parece válido.');
  if (data.password.length < 8) return invalid('register', 'regPass', 'A senha precisa ter pelo menos 8 caracteres.');
  if (data.password !== val('regPass2')) return invalid('register', 'regPass2', 'As senhas não conferem.');
  AUTH.registerMsg = { text: '', kind: 'err' };
  AUTH.busy = 'register';
  publishShell();
  const r = await auth!.register(data).catch(() => null);
  AUTH.busy = null;
  if (r && r.ok) {
    enterApp(r.user, r.legacyId);
    return;
  }
  AUTH.registerMsg = { text: authError(r), kind: 'err' };
  if (r && r.status === 409) AUTH.invalid = ['regEmail'];
  publishShell();
  if (r && r.status === 409) focusField('regEmail');
}
export async function logout(): Promise<void> {
  setUserPop(false);
  await DESKTOP_AUTH!.logout().catch(() => {});
  leaveApp('Você saiu da sua conta.');
}
export function initUserMenu(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SIDEBAR.userPop) {
      e.preventDefault();
      setUserPop(false, true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (SIDEBAR.userPop && !target(e).closest('#userPop, #openUser')) setUserPop(false);
  });
}
