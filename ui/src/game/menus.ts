// Menus do topo do Tabuleiro: "Nova partida" (dropdown ancorado no botão), menu ⋮ e a gaveta do PGN.
// O desenho é TopBar (game/top-bar.tsx); aqui ficam o estado aberto/fechado, o foco e os atalhos do document.
import { S } from '../core/state';
import { recommendBot } from '../core/rating';
import { closeStyle } from '../board/style-picker';
import { setUserPop } from '../desktop/account';
import { publish } from '../store/view-store';
import { target } from '../ui/dom';
import { RATING } from './rating';
import { REFS, UI, focusId, type Drawer } from './ui-state';

export function setDrawer(id: Drawer): void {
  if (UI.drawer === id) return;
  UI.drawer = id;
  publish('board');
}
// posiciona o dropdown: alinhado à direita do botão, sem sair da tela
export function placePop(): void {
  const pop = document.getElementById('newGame'),
    btnEl = document.getElementById('openNew');
  if (!pop || !btnEl || pop.hidden) return;
  const btn = btnEl.getBoundingClientRect(),
    vw = document.documentElement.clientWidth,
    w = pop.offsetWidth;
  const left = Math.max(16, Math.min(btn.right - w, vw - 16 - w));
  pop.style.setProperty('--pop-shift', btn.right - (left + w) + 'px');
}
export function closePop(focusBtn: boolean): void {
  if (UI.drawer !== 'newGame') return;
  setDrawer(null);
  if (focusBtn) focusId('openNew');
}
export function setMenu(open: boolean, focusBtn?: boolean): void {
  if (UI.menu !== open) {
    UI.menu = open;
    publish('board');
  }
  if (open) focusId('menuPop');
  else if (focusBtn) focusId('openMenu');
}
// abre a escolha de nível do bot (botão do topo e, no desktop, "Nova partida" da sidebar e do Início)
export function openNewPop(): void {
  setMenu(false);
  setUserPop(false);
  S.pickBot = recommendBot(RATING.rating);
  UI.drawer = 'newGame';
  publish('board');
  placePop();
  focusId('newGame');
}
export function toggleMenu(): void {
  if (UI.menu) {
    setMenu(false);
    return;
  }
  closePop(false);
  closeStyle(false);
  setUserPop(false);
  setMenu(true);
}
export function toggleNewPop(): void {
  if (UI.drawer === 'newGame') {
    setMenu(false);
    setUserPop(false);
    closePop(false);
    return;
  }
  openNewPop();
}
export function togglePgn(): void {
  setMenu(false);
  setDrawer(UI.drawer === 'pgnBox' ? null : 'pgnBox');
  if (UI.drawer === 'pgnBox' && REFS.pgnIn) REFS.pgnIn.focus();
}
export function initMenus(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && UI.menu) {
      e.preventDefault();
      setMenu(false, true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (UI.menu && !target(e).closest('#menuPop, #openMenu')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && UI.drawer === 'newGame') {
      e.preventDefault();
      closePop(true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (UI.drawer === 'newGame' && !target(e).closest('#newGame, #openNew')) closePop(false);
  });
  window.addEventListener('resize', placePop);
}
