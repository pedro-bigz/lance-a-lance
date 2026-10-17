/* Lance a Lance: entrada da interface.
   Os módulos só definem funções e estado; aqui as partes são ligadas na mesma ordem da antiga página única
   (a ordem importa: vários atalhos de teclado no document conferem e.defaultPrevented de quem registrou antes). */
import './styles/index.css';
import { S } from './core/state';
import { initBoardInput } from './board/input';
import { initStylePicker } from './board/style-picker';
import { engine } from './engine/engine';
import { ACCOUNT, enterApp, initAuthForms, initUserMenu, leaveApp, showAuth, authError } from './desktop/account';
import { DESKTOP_AUTH } from './desktop/bridge';
import { initProfile } from './desktop/profile';
import { initSidebarControls } from './desktop/sidebar';
import { initViews } from './desktop/views';
import { initGameControls, initNav, initReplayButton } from './game/controls';
import { initHistoryModal } from './game/history';
import { initMenus } from './game/menus';
import { initMocks } from './game/mocks';
import { renderAll, setStatus } from './game/panel';
import { initResign } from './game/resign';
import { AUTH_NOTE } from './store/local';
import { initStudy } from './study/panel';
import { initTutor } from './tutor/tutor';
import { initTheme } from './ui/theme';
import { bootApp } from './boot';

engine.ready.then(
  () => {
    setStatus();
  },
  () => {
    S.engineErr = true;
    setStatus();
    renderAll();
  },
);
initBoardInput();
initNav();
initMenus();
initGameControls();
initTutor();
initStudy();
initResign();
initReplayButton();
initHistoryModal();
initMocks();
initStylePicker();
initTheme();
initAuthForms();
initUserMenu();
initProfile();
initViews();
initSidebarControls();

if (DESKTOP_AUTH) {
  DESKTOP_AUTH.onExpired((info) => {
    const note = (info && info.message) || 'Sua sessão expirou. Entre de novo.';
    if (ACCOUNT.user) leaveApp(note);
    else showAuth('login', note, 'err');
  });
  let note = '';
  try {
    note = sessionStorage.getItem(AUTH_NOTE) || '';
    sessionStorage.removeItem(AUTH_NOTE);
  } catch (_) {}
  DESKTOP_AUTH.me().then(
    (r) => {
      if (r && r.ok) enterApp(r.user);
      else
        showAuth('login', note || (r && r.status !== 401 ? authError(r) : r && r.error) || '', note === 'Você saiu da sua conta.' ? 'info' : 'err');
    },
    () => showAuth('login', 'Não foi possível verificar o login. Tente entrar de novo.', 'err'),
  );
} else {
  bootApp();
}
