/* ---------- Sidebar (só no app desktop) ----------
   Recolhida ou aberta fica lembrado no localStorage (lance-a-lance:sidebar:v1). Em janela de até 900 px vira gaveta:
   o botão de menu do topo abre, e ela fecha ao navegar, com Esc ou clicando fora. */
import { closePop, openNewPop, setMenu } from '../game/menus';
import { SIDEBAR_KEY, isStr, lsGet, lsSet } from '../store/local';
import { $, $opt, target } from '../ui/dom';
import { setUserPop } from './account';
import { goView, renderViewNav } from './views';

export const NARROW = window.matchMedia('(max-width: 900px)');
function setCollapsed(on: boolean): void {
  document.documentElement.classList.toggle('sb-collapsed', on);
  const b = $('#sideCollapse');
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Expandir menu' : '';
  b.setAttribute('aria-label', on ? 'Expandir menu' : 'Recolher menu');
  (b.querySelector('.side-label') as HTMLElement).textContent = on ? 'Expandir menu' : 'Recolher menu';
  $('#sideNew').title = on ? 'Nova partida' : '';
  renderViewNav();
}
export function setSide(open: boolean, focusBtn?: boolean): void {
  const root = document.documentElement;
  if (!root.classList.contains('has-sidebar')) return;
  open = !!open && NARROW.matches;
  const was = root.classList.contains('sb-open');
  root.classList.toggle('sb-open', open);
  $('#sideScrim').hidden = !open;
  $('#openSide').setAttribute('aria-expanded', String(open));
  $('#sidebar').inert = NARROW.matches && !open; // gaveta fechada: fora do Tab
  if (open && !was) {
    setUserPop(false);
    closePop(false);
    setMenu(false);
    ($opt('#sideNav [aria-current]') || $('#sideNew')).focus();
  } else if (!open && was && focusBtn) $('#openSide').focus();
}
export function initSidebar(): void {
  document.documentElement.classList.add('has-sidebar');
  $('#sidebar').hidden = false;
  setCollapsed(lsGet<string>(SIDEBAR_KEY, 'aberta', isStr) === 'recolhida');
  setSide(false);
}
// "Nova partida": vai para o tabuleiro e abre a mesma escolha de nível do botão do topo. A partida em andamento
// continua salva na conta e pode ser retomada pelo Histórico.
export function newGameFlow(): void {
  setSide(false);
  goView('jogo');
  openNewPop();
}
export function initSidebarControls(): void {
  $('#sideCollapse').onclick = () => {
    const on = !document.documentElement.classList.contains('sb-collapsed');
    setCollapsed(on);
    lsSet(SIDEBAR_KEY, on ? 'recolhida' : 'aberta');
  };
  $('#openSide').onclick = () => setSide(!document.documentElement.classList.contains('sb-open'));
  $('#sideScrim').addEventListener('pointerdown', () => setSide(false, true));
  $('#sideNav').addEventListener('click', (e) => {
    if (target(e).closest('a')) setSide(false);
  });
  NARROW.addEventListener('change', () => {
    setSide(false);
    renderViewNav();
  });
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'Escape' &&
      !e.defaultPrevented &&
      document.documentElement.classList.contains('sb-open') &&
      !document.querySelector('.modal:not([hidden])')
    ) {
      e.preventDefault();
      setSide(false, true);
    }
  });
  $('#sideNew').onclick = newGameFlow;
}
