/* ---------- Sidebar (só no app desktop) ----------
   Recolhida ou aberta fica lembrado no localStorage (lance-a-lance:sidebar:v1). Em janela de até 900 px vira gaveta:
   o botão de menu do topo abre, e ela fecha ao navegar, com Esc ou clicando fora. O desenho é Sidebar
   (desktop/sidebar-view.tsx); as classes de estado continuam no <html> (has-sidebar, sb-collapsed, sb-open). */
import { closePop, openNewPop, setMenu } from '../game/menus';
import { SIDEBAR_KEY, isStr, lsGet, lsSet } from '../store/local';
import { publishShell } from '../store/view-store';
import { setUserPop } from './account';
import { goView } from './views';

export const NARROW = window.matchMedia('(max-width: 900px)');
export interface SidebarState {
  /** a sidebar existe (depois do login) */
  shown: boolean;
  /** recolhida; null = ainda não ligada (artifact e antes do login) */
  collapsed: boolean | null;
  /** gaveta aberta (janela estreita) */
  open: boolean;
  /** menu da conta aberto */
  userPop: boolean;
}
export const SIDEBAR: SidebarState = { shown: false, collapsed: null, open: false, userPop: false };
/** gaveta fechada em janela estreita: fora do Tab */
export const sidebarInert = (): boolean => SIDEBAR.shown && NARROW.matches && !SIDEBAR.open;

function setCollapsed(on: boolean): void {
  document.documentElement.classList.toggle('sb-collapsed', on);
  SIDEBAR.collapsed = on;
  publishShell();
}
export function toggleCollapsed(): void {
  const on = !document.documentElement.classList.contains('sb-collapsed');
  setCollapsed(on);
  lsSet(SIDEBAR_KEY, on ? 'recolhida' : 'aberta');
}
export function setSide(open: boolean, focusBtn?: boolean): void {
  const root = document.documentElement;
  if (!root.classList.contains('has-sidebar')) return;
  open = !!open && NARROW.matches;
  const was = root.classList.contains('sb-open');
  root.classList.toggle('sb-open', open);
  SIDEBAR.open = open;
  publishShell();
  if (open && !was) {
    setUserPop(false);
    closePop(false);
    setMenu(false);
    (document.querySelector<HTMLElement>('#sideNav [aria-current]') || document.getElementById('sideNew'))?.focus();
  } else if (!open && was && focusBtn) document.getElementById('openSide')?.focus();
}
export const toggleSide = (): void => setSide(!document.documentElement.classList.contains('sb-open'));
export function initSidebar(): void {
  document.documentElement.classList.add('has-sidebar');
  SIDEBAR.shown = true;
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
  NARROW.addEventListener('change', () => {
    setSide(false);
    publishShell();
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
}
