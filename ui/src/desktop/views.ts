/* ---------- Telas do app desktop (views com rota por hash) ----------
   Roteador próprio, sem biblioteca: a rota vem do hash (#/NOME) e fica em ROUTE; o App (app/app.tsx) mostra a
   section da tela aberta e esconde as outras.
   Contrato para criar uma tela nova:
   1. Componente: <section class="view" data-view="NOME"> em app/app.tsx, ao lado das outras views, com o componente
      da tela dentro (só depois do login, como as outras). Modais da tela usam o componente Modal (react/modal.tsx).
   2. Registro: VIEWS.NOME = {title:'Título', roles:['administrador','jogador'], nav:true, icon:'chave', onShow(){…}, onHide(){…}}
      roles = papéis que podem abrir; onShow/onHide são opcionais.
      Atalho: alias:'OUTRA' faz o item mostrar a section da tela OUTRA (o endereço continua #/NOME) e depois chamar
      onShow. ctx:'estudo' troca a partida do tabuleiro para a do estudo (veja "Contextos do tabuleiro" em
      store/contexts.ts); todas as outras rotas usam a partida do Tabuleiro.
      Sidebar: nav:true põe a tela na sidebar, na ordem das chaves de VIEWS, com o ícone NAV_ICONS[icon]
      (desktop/sidebar-view.tsx; traço de 24×24, crie a chave lá se precisar de um novo) e o texto de title. Só
      aparece para quem tem o papel. O item da tela aberta fica destacado (aria-current). "Nova partida" não é uma
      view: é o botão do topo da sidebar.
   3. Navegação: link para "#/NOME", showView('NOME') (troca o hash e volta pelo hashchange) ou goView('NOME')
      (troca na hora, útil para abrir algo na tela logo depois). Sem permissão, volta para DEFAULT_VIEW com um aviso.
   Depois do login abre sempre DEFAULT_VIEW (o Início). Trocar de view só esconde e mostra as sections: o estado de
   cada tela (partida, bot, Stockfish) continua vivo. Os controles do topo que só servem ao jogo levam a classe
   game-only e somem nas outras views (o topo inteiro some quando não sobra nada nele; em janela estreita ele fica,
   com o botão que abre a sidebar como gaveta). Quando uma partida é gravada, viewDataChanged() avisa a view aberta.
   Telas de formulário e lista (Início, Histórico, Estatísticas e Administração): o onShow só chama
   refreshView('NOME'), que publica o tópico 'tela:NOME' (store/data-events.ts); a tela assina com useViewRefresh e
   recarrega.
   No artifact (sem window.lanceDesktop) não há sidebar nem roteamento: só a view do jogo aparece. */
import { closeStyle } from '../board/style-picker';
import { closePop, setMenu } from '../game/menus';
import { switchBoardCtx, type BoardCtx } from '../store/contexts';
import { emit } from '../store/data-events';
import { publish, publishShell } from '../store/view-store';
import { setStudy } from '../study/panel';
import type { ApiUser } from '../types/api';
import { viewToast } from '../ui/toast';
import { ACCOUNT, setUserPop } from './account';
import { DESKTOP_AUTH } from './bridge';
import { setSide } from './sidebar';

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
export const DEFAULT_VIEW = DESKTOP_AUTH ? 'inicio' : 'jogo';
/** tela mostrada (section) e item da sidebar aberto (difere nos atalhos, ex.: aberturas → jogo); null antes do roteamento */
export const ROUTE: { view: string | null; route: string | null } = { view: null, route: null };
export const currentView = (): string | null => ROUTE.view;
/** section visível: antes do roteamento (e sempre no artifact) é a do jogo */
export const shownView = (): string => ROUTE.view || 'jogo';
/** pede à tela que recarregue os dados (tópico 'tela:NOME'; veja store/data-events.ts) */
export function refreshView(name: string): void {
  emit('tela:' + name);
}
/** idem, só se a tela for a que está aberta (as outras recarregam quando forem abertas) */
export function refreshIfCurrent(name: string): void {
  if (ROUTE.view === name) refreshView(name);
}
export const canView = (name: string, user: ApiUser | null = ACCOUNT.user): boolean =>
  !!(VIEWS[name] && user && VIEWS[name].roles.includes(user.role));
const viewFromHash = () => {
  const m = /^#\/([\w-]+)/.exec(location.hash);
  return m ? (m[1] as string) : null;
};
/** telas da sidebar para quem está logado, na ordem de VIEWS */
export const navViews = (): string[] => Object.keys(VIEWS).filter((n) => VIEWS[n]!.nav && canView(n));
/** item da sidebar destacado */
export const navCurrent = (): string | null => ROUTE.route || ROUTE.view;
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
  ROUTE.route = route;
  switchBoardCtx(rdef.ctx || 'jogo'); // Aberturas tem a sua partida; as outras telas usam a do Tabuleiro
  name = alias || route;
  if (name === ROUTE.view) {
    document.title = `${rdef.title} · Lance a Lance`;
    publishShell();
    if (alias && rdef.onShow) rdef.onShow();
    return;
  }
  const prev = ROUTE.view;
  ROUTE.view = name;
  setMenu(false);
  closePop(false);
  setUserPop(false);
  closeStyle(false);
  document.documentElement.dataset.view = name;
  document.title = route === DEFAULT_VIEW ? 'Lance a Lance' : `${rdef.title} · Lance a Lance`;
  publishShell();
  if (prev && VIEWS[prev]!.onHide) VIEWS[prev]!.onHide!();
  if (VIEWS[name]!.onShow) VIEWS[name]!.onShow!();
  if (alias && rdef.onShow) rdef.onShow();
  if (name === 'jogo') publish('board'); // o tabuleiro esteve escondido: redesenha setas e marcações no tamanho certo
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
