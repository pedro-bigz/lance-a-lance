// Menus do topo do Tabuleiro: "Nova partida" (dropdown ancorado no botão), menu ⋮ e a gaveta do PGN
import { S } from '../core/state';
import { recommendBot } from '../core/rating';
import { closeStyle } from '../board/style-picker';
import { setUserPop } from '../desktop/account';
import { $, target } from '../ui/dom';
import { renderBots } from './controls';
import { RATING, renderRecNote } from './rating';

export function setDrawer(id: 'newGame' | 'pgnBox' | null): void {
  for (const [d, b] of [
    ['newGame', 'openNew'],
    ['pgnBox', 'openPgn'],
  ]) {
    const open = d === id;
    $('#' + d).hidden = !open;
    $('#' + b).setAttribute('aria-expanded', String(open));
  }
}
// posiciona o dropdown: alinhado à direita do botão, sem sair da tela
function placePop(): void {
  const pop = $('#newGame');
  if (pop.hidden) return;
  const btn = $('#openNew').getBoundingClientRect(),
    vw = document.documentElement.clientWidth,
    w = pop.offsetWidth;
  const left = Math.max(16, Math.min(btn.right - w, vw - 16 - w));
  pop.style.setProperty('--pop-shift', btn.right - (left + w) + 'px');
}
export function closePop(focusBtn: boolean): void {
  if ($('#newGame').hidden) return;
  setDrawer(null);
  if (focusBtn) $('#openNew').focus();
}
export function setMenu(open: boolean, focusBtn?: boolean): void {
  $('#menuPop').hidden = !open;
  $('#openMenu').setAttribute('aria-expanded', String(open));
  if (open) $('#menuPop').focus();
  else if (focusBtn) $('#openMenu').focus();
}
// abre a escolha de nível do bot (botão do topo e, no desktop, "Nova partida" da sidebar e do Início)
export function openNewPop(): void {
  setMenu(false);
  setUserPop(false);
  S.pickBot = recommendBot(RATING.rating);
  renderBots();
  renderRecNote();
  setDrawer('newGame');
  placePop();
  $('#newGame').focus();
}
export function initMenus(): void {
  $('#openMenu').onclick = () => {
    if (!$('#menuPop').hidden) {
      setMenu(false);
      return;
    }
    closePop(false);
    closeStyle(false);
    setUserPop(false);
    setMenu(true);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#menuPop').hidden) {
      e.preventDefault();
      setMenu(false, true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!$('#menuPop').hidden && !target(e).closest('#menuPop, #openMenu')) setMenu(false);
  });
  $('#openNew').onclick = () => {
    if (!$('#newGame').hidden) {
      setMenu(false);
      setUserPop(false);
      closePop(false);
      return;
    }
    openNewPop();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#newGame').hidden) {
      e.preventDefault();
      closePop(true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!$('#newGame').hidden && !target(e).closest('#newGame, #openNew')) closePop(false);
  });
  window.addEventListener('resize', placePop);
  $('#openPgn').onclick = () => {
    setMenu(false);
    setDrawer($('#pgnBox').hidden ? 'pgnBox' : null);
    if (!$('#pgnBox').hidden) $('#pgnIn').focus();
  };
  for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.onclick = () => setDrawer(null);
}
