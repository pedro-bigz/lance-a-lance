/* Lance a Lance: entrada da interface.
   Monta a árvore React (app/app.tsx) e liga os atalhos do document na mesma ordem da antiga página única (a ordem
   importa: vários atalhos de teclado conferem e.defaultPrevented de quem registrou antes; Esc fecha primeiro o menu ⋮,
   depois a nova partida, o estudo, o histórico ou o estilo, o menu da conta e por fim a gaveta da sidebar). */
import './styles/index.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { S } from './core/state';
import { initStylePicker } from './board/style-picker';
import { engine, setStatus } from './engine/engine';
import { ACCOUNT, enterApp, initUserMenu, leaveApp, showAuth, authError } from './desktop/account';
import { DESKTOP_AUTH } from './desktop/bridge';
import { initSidebarControls } from './desktop/sidebar';
import { initGameControls, initNav } from './game/controls';
import { initMenus } from './game/menus';
import { initMocks } from './game/mocks';
import { replaySync } from './game/replay';
import { resignSync } from './game/resign';
import { UI } from './game/ui-state';
import { AUTH_NOTE } from './store/local';
import { onBeforeGameRender, publish } from './store/view-store';
import { blind } from './core/state';
import { initStudy } from './study/panel';
import { initTutor } from './tutor/tutor';
import { initTheme } from './ui/theme';
import { bootApp } from './boot';

// antes de cada redesenho da tela do jogo: estado derivado que antes o renderAll acertava
onBeforeGameRender(() => {
  document.body.classList.toggle('blind', blind());
  replaySync();
  resignSync();
});
const root = createRoot(document.getElementById('app')!);
flushSync(() => root.render(<App />));

engine.ready.then(
  () => {
    UI.engineReady = true;
    setStatus();
  },
  () => {
    S.engineErr = true;
    setStatus();
    publish();
  },
);
initNav();
initMenus();
initGameControls();
initTutor();
initStudy();
initMocks();
initStylePicker();
initTheme();
initUserMenu();
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
