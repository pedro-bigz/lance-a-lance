/* ---------- Telas do app desktop (views com rota por hash) ----------
   Contrato para criar uma tela nova:
   1. HTML: <section class="view" data-view="NOME" hidden> dentro de #appRoot (ui/index.html), ao lado das outras views
      (fora delas). Modais da tela ficam fora das views, junto dos outros .modal.
   2. Registro: VIEWS.NOME = {title:'Título', roles:['administrador','jogador'], nav:true, icon:'chave', onShow(){…}, onHide(){…}}
      roles = papéis que podem abrir; onShow/onHide são opcionais.
      Atalho: alias:'OUTRA' faz o item mostrar a section da tela OUTRA (o endereço continua #/NOME) e depois chamar
      onShow. ctx:'estudo' troca a partida do tabuleiro para a do estudo (veja "Contextos do tabuleiro" em
      store/contexts.ts); todas as outras rotas usam a partida do Tabuleiro.
      Sidebar: nav:true põe a tela na sidebar, na ordem das chaves de VIEWS, com o ícone NAV_ICONS[icon] (traço de
      24×24; crie a chave lá se precisar de um novo) e o texto de title. Só aparece para quem tem o papel. O item da
      tela aberta fica destacado (aria-current). "Nova partida" não é uma view: é o botão do topo da sidebar.
   3. Navegação: link para "#/NOME", showView('NOME') (troca o hash e volta pelo hashchange) ou goView('NOME')
      (troca na hora, útil para abrir algo na tela logo depois). Sem permissão, volta para DEFAULT_VIEW com um aviso.
   Depois do login abre sempre DEFAULT_VIEW (o Início). Trocar de view só esconde e mostra as sections: o estado de
   cada tela (partida, bot, Stockfish) continua vivo. Os controles do topo que só servem ao jogo levam a classe
   game-only e somem nas outras views (o topo inteiro some quando não sobra nada nele; em janela estreita ele fica,
   com o botão que abre a sidebar como gaveta). Quando uma partida é gravada, viewDataChanged() avisa a view aberta.
   Ilhas React: Início, Histórico, Estatísticas e Administração são componentes React montados dentro da própria section
   (desktop/islands.tsx). O onShow delas só chama refreshView('NOME'), que publica o tópico 'tela:NOME'
   (store/data-events.ts); a ilha assina com useViewRefresh e recarrega.
   No artifact (sem window.lanceDesktop) não há sidebar nem roteamento: só a view do jogo aparece. */
import { renderBoard } from '../board/render';
import { closeStyle } from '../board/style-picker';
import { closePop, setMenu } from '../game/menus';
import { switchBoardCtx, type BoardCtx } from '../store/contexts';
import { setStudy } from '../study/panel';
import type { ApiUser } from '../types/api';
import { $, $opt } from '../ui/dom';
import { esc } from '../ui/escape';
import { viewToast } from '../ui/toast';
import { ACCOUNT, setUserPop } from './account';
import { emit } from '../store/data-events';
import { DESKTOP_AUTH } from './bridge';
import { NARROW, setSide } from './sidebar';

const ALL_ROLES = ['administrador', 'jogador'];
export interface ViewDef {
  title: string;
  roles: string[];
  nav?: boolean;
  icon: string;
  alias?: string;
  ctx?: BoardCtx;
  onShow?: () => void;
  onHide?: () => void;
}
export const VIEWS: Record<string, ViewDef> = {
  inicio: { title: 'Início', roles: ALL_ROLES, nav: true, icon: 'inicio', onShow: () => refreshView('inicio') },
  jogo: { title: 'Tabuleiro', roles: ALL_ROLES, nav: true, icon: 'jogo' },
  aberturas: { title: 'Aberturas', roles: ALL_ROLES, nav: true, icon: 'aberturas', alias: 'jogo', ctx: 'estudo', onShow: () => setStudy(true) },
  estatisticas: { title: 'Estatísticas', roles: ALL_ROLES, nav: true, icon: 'estatisticas', onShow: () => refreshView('estatisticas') },
  historico: { title: 'Histórico', roles: ALL_ROLES, nav: true, icon: 'historico', onShow: () => refreshView('historico') },
  admin: { title: 'Administração', roles: ['administrador'], nav: true, icon: 'admin', onShow: () => refreshView('admin') },
};
const NAV_ICONS: Record<string, string> = {
  inicio: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h5v-6h3v6h5V9"/>',
  jogo: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path fill="currentColor" stroke="none" d="M7.75 3.5H12v4.25H7.75zM16.25 3.5h1.75a2.5 2.5 0 0 1 2.5 2.5v1.75h-4.25zM3.5 7.75h4.25V12H3.5zM12 7.75h4.25V12H12zM7.75 12H12v4.25H7.75zM16.25 12h4.25v4.25h-4.25zM3.5 16.25h4.25v4.25H6a2.5 2.5 0 0 1-2.5-2.5zM12 16.25h4.25v4.25H12z"/>',
  aberturas:
    '<path d="M12 6.8C9.6 5.2 6.9 4.6 3.5 5v13.2c3.4-.4 6.1.2 8.5 1.8 2.4-1.6 5.1-2.2 8.5-1.8V5c-3.4-.4-6.1.2-8.5 1.8z"/><path d="M12 6.8V20"/>',
  estatisticas: '<path d="M3.5 20.5h17"/><path d="M6.5 17v-5M11 17V6M15.5 17v-8M20 17v-3"/>',
  historico: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/><path d="M12 8v4.2l2.8 1.8"/>',
  admin: '<path d="M12 3.2 4.8 6v5.4c0 4.4 3 8.1 7.2 9.4 4.2-1.3 7.2-5 7.2-9.4V6L12 3.2z"/><path d="m9.2 12 2 2 3.8-3.9"/>',
};
const navIcon = (k: string) => `<svg class="side-ico" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[k] || NAV_ICONS.inicio}</svg>`;
export const DEFAULT_VIEW = DESKTOP_AUTH ? 'inicio' : 'jogo';
let CURRENT_VIEW: string | null = null;
let CURRENT_ROUTE: string | null = null; // item da sidebar aberto (difere de CURRENT_VIEW nos atalhos, ex.: aberturas → jogo)
export const currentView = (): string | null => CURRENT_VIEW;
/** pede à ilha React da tela que recarregue os dados (tópico 'tela:NOME'; veja store/data-events.ts) */
export function refreshView(name: string): void {
  emit('tela:' + name);
}
/** idem, só se a tela for a que está aberta (as outras recarregam quando forem abertas) */
export function refreshIfCurrent(name: string): void {
  if (CURRENT_VIEW === name) refreshView(name);
}
export const canView = (name: string, user: ApiUser | null = ACCOUNT.user): boolean =>
  !!(VIEWS[name] && user && VIEWS[name].roles.includes(user.role));
const viewFromHash = () => {
  const m = /^#\/([\w-]+)/.exec(location.hash);
  return m ? (m[1] as string) : null;
};
export function renderViewNav(): void {
  const nav = $opt('#sideNav');
  if (!nav) return;
  const collapsed = document.documentElement.classList.contains('sb-collapsed') && !NARROW.matches;
  const names = Object.keys(VIEWS).filter((n) => VIEWS[n]!.nav && canView(n));
  const cur = CURRENT_ROUTE || CURRENT_VIEW;
  nav.innerHTML = names
    .map(
      (n) =>
        `<a class="side-item" href="#/${n}"${n === cur ? ' aria-current="page"' : ''}${collapsed ? ` title="${esc(VIEWS[n]!.title)}"` : ''}>${navIcon(VIEWS[n]!.icon)}<span class="side-label">${esc(VIEWS[n]!.title)}</span></a>`,
    )
    .join('');
}
export function showView(name: string, { replace = false }: { replace?: boolean } = {}): void {
  if (!VIEWS[name]) name = DEFAULT_VIEW;
  if (!canView(name)) {
    if (name !== DEFAULT_VIEW) viewToast('Você não tem permissão para abrir essa tela.');
    name = DEFAULT_VIEW;
    replace = true;
  }
  if (location.hash !== '#/' + name) {
    if (replace) history.replaceState(null, '', '#/' + name);
    else {
      location.hash = '#/' + name;
      return;
    } // o hashchange chama de volta
  }
  setSide(false);
  const route = name,
    rdef = VIEWS[route]!,
    alias = rdef.alias;
  CURRENT_ROUTE = route;
  switchBoardCtx(rdef.ctx || 'jogo'); // Aberturas tem a sua partida; as outras telas usam a do Tabuleiro
  name = alias || route;
  if (name === CURRENT_VIEW) {
    document.title = `${rdef.title} · Lance a Lance`;
    renderViewNav();
    if (alias && rdef.onShow) rdef.onShow();
    return;
  }
  const prev = CURRENT_VIEW;
  CURRENT_VIEW = name;
  setMenu(false);
  closePop(false);
  setUserPop(false);
  closeStyle(false);
  for (const sec of document.querySelectorAll<HTMLElement>('#appRoot > .view')) sec.hidden = sec.dataset.view !== name;
  document.documentElement.dataset.view = name;
  document.title = route === DEFAULT_VIEW ? 'Lance a Lance' : `${rdef.title} · Lance a Lance`;
  renderViewNav();
  if (prev && VIEWS[prev]!.onHide) VIEWS[prev]!.onHide!();
  if (VIEWS[name]!.onShow) VIEWS[name]!.onShow!();
  if (alias && rdef.onShow) rdef.onShow();
  if (name === 'jogo') renderBoard(); // o tabuleiro esteve escondido: redesenha setas e marcações no tamanho certo
  window.scrollTo(0, 0);
}
// troca de view na hora, guardando a anterior no histórico do navegador (o "voltar" continua funcionando)
export function goView(name: string): void {
  if (location.hash !== '#/' + name) history.pushState(null, '', '#/' + name);
  showView(name, { replace: true });
}
export function startRouter(): void {
  window.addEventListener('hashchange', () => showView(viewFromHash() || DEFAULT_VIEW, { replace: true }));
  showView(DEFAULT_VIEW, { replace: true }); // login (ou sessão lembrada) cai sempre no Início
}
// uma partida foi gravada (criada ou concluída): atualiza a view aberta que mostra partidas
let viewDataTimer: ReturnType<typeof setTimeout> | 0 = 0;
export function viewDataChanged(important: boolean): void {
  if (!important) return;
  clearTimeout(viewDataTimer);
  viewDataTimer = setTimeout(() => {
    refreshIfCurrent('inicio');
    refreshIfCurrent('historico');
  }, 300);
}
export function initViews(): void {
  $('#openAdmin').onclick = () => setUserPop(false);
}
