/* ---------- Conta do usuário (só no app desktop) ----------
   O login fica no processo principal do app: a página manda e-mail e senha uma vez e recebe só os dados
   públicos do usuário; o token de acesso nunca passa por aqui. */
import { bootApp } from '../boot';
import { closePop, setMenu } from '../game/menus';
import { closeStyle } from '../board/style-picker';
import { AUTH_NOTE } from '../store/local';
import type { ApiUser, IpcFail } from '../types/api';
import { $, target } from '../ui/dom';
import { busy, clearInvalid, formMsg, invalid } from '../ui/forms';
import { roleName } from './admin';
import { DESKTOP_AUTH } from './bridge';
import { initSidebar } from './sidebar';
import { canView, renderViewNav, startRouter } from './views';

/** legacyId: id numérico de antes dos uuids (só no 1º login, veja migrateLegacyKeys) */
export const ACCOUNT: { user: ApiUser | null; legacyId: string | null } = { user: null, legacyId: null };
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function initials(u: ApiUser): string {
  const a = (u.first_name || '').trim()[0] || '',
    b = (u.last_name || '').trim()[0] || '';
  return (a + b || (u.email || '?')[0] || '').toUpperCase();
}
export function authError(r: Pick<IpcFail, 'status' | 'error'> | null | undefined): string {
  if (!r) return 'Não foi possível conectar ao servidor. Tente de novo.';
  if (r.status === 429) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  return r.error || `Erro ${r.status || 'desconhecido'}. Tente de novo.`;
}

export function showAuth(view: 'login' | 'register', note?: string, kind = 'info'): void {
  document.documentElement.classList.add('needs-auth');
  $('#appRoot').inert = true;
  $('#authScreen').hidden = false;
  const login = view !== 'register';
  $('#loginForm').hidden = !login;
  $('#registerForm').hidden = login;
  formMsg($('#loginMsg'), login ? note : '');
  if (login && note) $('#loginMsg').className = 'form-msg ' + kind;
  formMsg($('#registerMsg'), '');
  (login ? ($<HTMLInputElement>('#loginEmail').value ? $('#loginPass') : $('#loginEmail')) : $('#regFirst')).focus();
}
export function renderAccount(): void {
  const u = ACCOUNT.user;
  if (!u) return;
  $('#userWrap').hidden = false;
  $('#userInitials').textContent = $('#userInitialsBig').textContent = initials(u);
  $('#userName').textContent = `${u.first_name} ${u.last_name}`.trim();
  $('#userEmail').textContent = u.email;
  $('#openUser').title = `${u.first_name} ${u.last_name} · ${u.email}`;
  $('#sideUserName').textContent = `${u.first_name} ${u.last_name}`.trim();
  $('#sideUserRole').textContent = u.role_name || roleName(u.role);
  $('#openAdmin').hidden = !canView('admin');
  renderViewNav();
}
export function enterApp(user: ApiUser, legacyId?: string | null): void {
  ACCOUNT.user = user;
  ACCOUNT.legacyId = legacyId || null;
  $('#authScreen').hidden = true;
  for (const f of ['#loginForm', '#registerForm']) $<HTMLFormElement>(f).reset();
  document.documentElement.classList.remove('needs-auth');
  $('#appRoot').inert = false;
  initSidebar();
  renderAccount();
  bootApp();
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
  if ($('#userWrap').hidden) return;
  $('#userPop').hidden = !open;
  $('#openUser').setAttribute('aria-expanded', String(open));
  if (open) $('#userPop').focus();
  else if (focusBtn) $('#openUser').focus();
}

export function initAuthForms(): void {
  const auth = DESKTOP_AUTH;
  $('#toRegister').onclick = () => showAuth('register');
  $('#toLogin').onclick = () => showAuth('login');
  $<HTMLFormElement>('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement,
      msg = $('#loginMsg'),
      btn = $<HTMLButtonElement>('#loginBtn');
    clearInvalid(form);
    const email = $<HTMLInputElement>('#loginEmail').value.trim(),
      password = $<HTMLInputElement>('#loginPass').value;
    if (!email) return invalid(msg, $('#loginEmail'), 'Informe o e-mail.');
    if (!EMAIL_RE.test(email)) return invalid(msg, $('#loginEmail'), 'Esse e-mail não parece válido.');
    if (!password) return invalid(msg, $('#loginPass'), 'Informe a senha.');
    formMsg(msg, '');
    busy(btn, true, 'Entrando…');
    const r = await auth!.login({ email, password }).catch(() => null);
    busy(btn, false);
    if (r && r.ok) {
      enterApp(r.user, r.legacyId);
      return;
    }
    formMsg(msg, authError(r));
    $<HTMLInputElement>('#loginPass').value = '';
    $('#loginPass').focus();
  };
  $<HTMLFormElement>('#registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement,
      msg = $('#registerMsg'),
      btn = $<HTMLButtonElement>('#registerBtn');
    clearInvalid(form);
    const val = (s: string) => $<HTMLInputElement>(s).value;
    const data = {
      first_name: val('#regFirst').trim(),
      last_name: val('#regLast').trim(),
      email: val('#regEmail').trim(),
      password: val('#regPass'),
    };
    if (!data.first_name) return invalid(msg, $('#regFirst'), 'Informe o nome.');
    if (!data.last_name) return invalid(msg, $('#regLast'), 'Informe o sobrenome.');
    if (!data.email) return invalid(msg, $('#regEmail'), 'Informe o e-mail.');
    if (!EMAIL_RE.test(data.email)) return invalid(msg, $('#regEmail'), 'Esse e-mail não parece válido.');
    if (data.password.length < 8) return invalid(msg, $('#regPass'), 'A senha precisa ter pelo menos 8 caracteres.');
    if (data.password !== val('#regPass2')) return invalid(msg, $('#regPass2'), 'As senhas não conferem.');
    formMsg(msg, '');
    busy(btn, true, 'Criando conta…');
    const r = await auth!.register(data).catch(() => null);
    busy(btn, false);
    if (r && r.ok) {
      enterApp(r.user, r.legacyId);
      return;
    }
    formMsg(msg, authError(r));
    if (r && r.status === 409) {
      $('#regEmail').setAttribute('aria-invalid', 'true');
      $('#regEmail').focus();
    }
  };
}
export function initUserMenu(): void {
  $('#openUser').onclick = () => {
    if (!$('#userPop').hidden) {
      setUserPop(false);
      return;
    }
    closePop(false);
    closeStyle(false);
    setMenu(false);
    setUserPop(true);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#userPop').hidden) {
      e.preventDefault();
      setUserPop(false, true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!$('#userPop').hidden && !target(e).closest('#userPop, #openUser')) setUserPop(false);
  });
  $('#btnLogout').onclick = async () => {
    setUserPop(false);
    await DESKTOP_AUTH!.logout().catch(() => {});
    leaveApp('Você saiu da sua conta.');
  };
}
