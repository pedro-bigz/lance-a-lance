/* ---------- App: a árvore React da página inteira ----------
   Tela de entrada (só aparece no app desktop) e a área do app (#appRoot): sidebar, topo, as telas (sections .view,
   uma visível por vez, conforme a rota de desktop/views.ts), o tutor e o modal de histórico. As telas de formulário e
   lista (Início, Histórico, Administração, Estatísticas) e o modal de perfil só existem depois do login; os modais
   delas entram no fim de #appRoot por portal (react/modal.tsx). No artifact não há login nem rota: aparece o jogo. */
import { GameView } from '../game/game-view';
import { HistoryModal } from '../game/history-modal';
import { TopBar } from '../game/top-bar';
import { AdminView } from '../desktop/admin-view';
import { ACCOUNT, AUTH } from '../desktop/account';
import { AuthScreen } from '../desktop/auth-view';
import { HistoryPageView } from '../desktop/history-page-view';
import { HomeView } from '../desktop/home-view';
import { ProfileView } from '../desktop/profile-view';
import { Sidebar } from '../desktop/sidebar-view';
import { StatsView } from '../desktop/stats-view';
import { shownView } from '../desktop/views';
import { useShellView } from '../react/hooks';
import { TutorPanel } from '../tutor/tutor-panel';
import { ErrorBoundary, appFallback, authFallback } from './error-boundary';

function AppRoot() {
  useShellView();
  const view = shownView(),
    user = ACCOUNT.user;
  return (
    <div id="appRoot" inert={AUTH.visible || undefined}>
      {user ? <ProfileView /> : null}
      <Sidebar />
      <TopBar />
      <section className="view" data-view="jogo" aria-label="Jogo" hidden={view !== 'jogo'}>
        <GameView />
      </section>
      <section className="view home" data-view="inicio" hidden={view !== 'inicio'} aria-labelledby="homeHello">
        {user ? <HomeView /> : null}
      </section>
      <section className="view histpage" data-view="historico" hidden={view !== 'historico'} aria-labelledby="hpTtl">
        {user ? <HistoryPageView /> : null}
      </section>
      <section className="view admin" data-view="admin" hidden={view !== 'admin'} aria-labelledby="adminTtl">
        {user ? <AdminView /> : null}
      </section>
      <section className="view stats" data-view="estatisticas" hidden={view !== 'estatisticas'} aria-labelledby="statsTtl">
        {user ? <StatsView /> : null}
      </section>
      <TutorPanel />
      <HistoryModal />
    </div>
  );
}
export function App() {
  return (
    <>
      <ErrorBoundary fallback={authFallback}>
        <AuthScreen />
      </ErrorBoundary>
      <ErrorBoundary fallback={appFallback}>
        <AppRoot />
      </ErrorBoundary>
    </>
  );
}
