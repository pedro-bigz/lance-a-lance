/* ---------- Ilhas React do app desktop ----------
   Cada tela de formulário e lista (Início, Histórico, Estatísticas, Administração) tem um createRoot dentro da própria
   <section class="view" data-view="…"> de index.html; o modal de perfil é uma ilha sem section (abre de qualquer
   tela). Os modais das ilhas vão por createPortal para #appRoot, ao lado do modal de histórico do tabuleiro.
   As ilhas sobem uma vez, logo depois do login (enterApp), antes do roteamento: assim os modais ficam no DOM na mesma
   ordem de antes (perfil, usuário, exclusão de usuário, exclusão de partida) e o perfil existe em qualquer tela.
   Cada uma começa com o HTML vazio de antes e carrega os dados quando a tela é aberta: o onShow da view (views.ts)
   publica 'tela:<view>' e a ilha recarrega (useViewRefresh). No artifact (sem login) nenhuma ilha sobe. */
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { AdminView } from './admin-view';
import { HistoryPageView } from './history-page-view';
import { HomeView } from './home-view';
import { ProfileView } from './profile-view';
import { StatsView } from './stats-view';

const ROOTS: Root[] = [];
function mount(container: Element | null, node: ReactNode): void {
  if (!container) return;
  const root = createRoot(container);
  // síncrono: os portais entram em #appRoot na ordem das chamadas
  flushSync(() => root.render(node));
  ROOTS.push(root);
}
export function mountIslands(): void {
  if (ROOTS.length) return;
  mount(document.createElement('div'), <ProfileView />);
  mount(document.querySelector('#appRoot > section.view[data-view="inicio"]'), <HomeView />);
  mount(document.querySelector('#appRoot > section.view[data-view="admin"]'), <AdminView />);
  mount(document.querySelector('#appRoot > section.view[data-view="estatisticas"]'), <StatsView />);
  mount(document.querySelector('#appRoot > section.view[data-view="historico"]'), <HistoryPageView />);
}
