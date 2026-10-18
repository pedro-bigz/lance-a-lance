// Sidebar do app desktop: marca, "Nova partida", uma entrada por tela (VIEWS com nav:true que o papel pode abrir),
// recolher e o avatar com o menu da conta (perfil, administração, tema e sair). No artifact fica escondida.
import type { ReactNode } from 'react';
import { useShellView } from '../react/hooks';
import { THEME, setTheme, type ThemeChoice } from '../ui/theme';
import { ACCOUNT, initials, logout, setUserPop, toggleUserPop } from './account';
import { roleName } from './admin';
import { openProfile } from './profile';
import { NARROW, SIDEBAR, newGameFlow, setSide, sidebarInert, toggleCollapsed } from './sidebar';
import { VIEWS, canView, navCurrent, navViews } from './views';

const NAV_ICONS: Record<string, ReactNode> = {
  inicio: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h5v-6h3v6h5V9" />
    </>
  ),
  jogo: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path
        fill="currentColor"
        stroke="none"
        d="M7.75 3.5H12v4.25H7.75zM16.25 3.5h1.75a2.5 2.5 0 0 1 2.5 2.5v1.75h-4.25zM3.5 7.75h4.25V12H3.5zM12 7.75h4.25V12H12zM7.75 12H12v4.25H7.75zM16.25 12h4.25v4.25h-4.25zM3.5 16.25h4.25v4.25H6a2.5 2.5 0 0 1-2.5-2.5zM12 16.25h4.25v4.25H12z"
      />
    </>
  ),
  aberturas: (
    <>
      <path d="M12 6.8C9.6 5.2 6.9 4.6 3.5 5v13.2c3.4-.4 6.1.2 8.5 1.8 2.4-1.6 5.1-2.2 8.5-1.8V5c-3.4-.4-6.1.2-8.5 1.8z" />
      <path d="M12 6.8V20" />
    </>
  ),
  estatisticas: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M6.5 17v-5M11 17V6M15.5 17v-8M20 17v-3" />
    </>
  ),
  historico: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4.5v4h4" />
      <path d="M12 8v4.2l2.8 1.8" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3.2 4.8 6v5.4c0 4.4 3 8.1 7.2 9.4 4.2-1.3 7.2-5 7.2-9.4V6L12 3.2z" />
      <path d="m9.2 12 2 2 3.8-3.9" />
    </>
  ),
};
const NavIcon = ({ k }: { k: string }) => (
  <svg className="side-ico" viewBox="0 0 24 24" aria-hidden="true">
    {NAV_ICONS[k] || NAV_ICONS.inicio}
  </svg>
);
const THEMES: [ThemeChoice, string][] = [
  ['light', 'Claro'],
  ['dark', 'Escuro'],
  ['system', 'Seguir o sistema'],
];

function SideNav() {
  const collapsed = !!SIDEBAR.collapsed && !NARROW.matches;
  const cur = navCurrent();
  return (
    <nav className="side-nav" id="sideNav" aria-label="Telas">
      {ACCOUNT.user
        ? navViews().map((n) => (
            <a
              key={n}
              className="side-item"
              href={'#/' + n}
              aria-current={n === cur ? 'page' : undefined}
              title={collapsed ? VIEWS[n]!.title : undefined}
              onClick={() => setSide(false)}
            >
              <NavIcon k={VIEWS[n]!.icon} />
              <span className="side-label">{VIEWS[n]!.title}</span>
            </a>
          ))
        : null}
    </nav>
  );
}
function UserMenu() {
  const u = ACCOUNT.user;
  const name = u ? `${u.first_name} ${u.last_name}`.trim() : '';
  const ini = u ? initials(u) : '';
  return (
    <div className="pop-anchor" id="userWrap" hidden={!u}>
      <button
        className="side-user"
        id="openUser"
        aria-haspopup="dialog"
        aria-expanded={SIDEBAR.userPop}
        aria-controls="userPop"
        aria-label="Sua conta"
        title={u ? `${u.first_name} ${u.last_name} · ${u.email}` : undefined}
        onClick={toggleUserPop}
      >
        <span className="user-btn" id="userInitials" aria-hidden="true">
          {ini}
        </span>
        <span className="side-user-txt">
          <b id="sideUserName">{name}</b>
          <small id="sideUserRole">{u ? u.role_name || roleName(u.role) : ''}</small>
        </span>
      </button>
      <section className="card pop user-pop" id="userPop" hidden={!SIDEBAR.userPop} role="dialog" aria-label="Sua conta" tabIndex={-1}>
        <div className="user-head">
          <span className="user-btn big" id="userInitialsBig" aria-hidden="true">
            {ini}
          </span>
          <div>
            <b id="userName">{name}</b>
            <small id="userEmail">{u ? u.email : ''}</small>
          </div>
        </div>
        <hr className="menu-sep" />
        <button className="menu-item" id="openProfile" aria-haspopup="dialog" aria-controls="profileModal" onClick={openProfile}>
          Ver perfil
        </button>
        <a className="menu-item" id="openAdmin" href="#/admin" hidden={!canView('admin')} onClick={() => setUserPop(false)}>
          Painel de administração
        </a>
        <div className="menu-field">
          <span className="lab" id="themeLab">
            Tema
          </span>
          <div className="seg" id="themeSeg" role="group" aria-labelledby="themeLab">
            {THEMES.map(([v, label]) => (
              <button key={v} data-v={v} aria-pressed={THEME.choice === v} onClick={() => setTheme(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <hr className="menu-sep" />
        <button className="menu-item danger-item" id="btnLogout" onClick={logout}>
          Sair
        </button>
      </section>
    </div>
  );
}
export function Sidebar() {
  useShellView();
  const c = SIDEBAR.collapsed;
  const collapseLabel = c ? 'Expandir menu' : 'Recolher menu';
  return (
    <>
      <aside className="sidebar" id="sidebar" hidden={!SIDEBAR.shown} aria-label="Navegação" inert={sidebarInert() || undefined}>
        <a className="side-brand" href="#/inicio" title="Lance a Lance">
          <span className="logo" aria-hidden="true">
            ♞
          </span>
          <b>Lance a Lance</b>
        </a>
        <button className="btn primary side-new" id="sideNew" title={c === null || c ? 'Nova partida' : ''} onClick={newGameFlow}>
          <svg className="side-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="side-label">Nova partida</span>
        </button>
        <SideNav />
        <div className="side-foot">
          <button
            className="side-item side-collapse"
            id="sideCollapse"
            aria-pressed={!!c}
            title={c === null ? undefined : c ? 'Expandir menu' : ''}
            aria-label={c === null ? undefined : collapseLabel}
            onClick={toggleCollapsed}
          >
            <svg className="side-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m11 7-5 5 5 5M18 7l-5 5 5 5" />
            </svg>
            <span className="side-label">{collapseLabel}</span>
          </button>
          <UserMenu />
        </div>
      </aside>
      <div className="side-scrim" id="sideScrim" hidden={!SIDEBAR.open} onPointerDown={() => setSide(false, true)}></div>
    </>
  );
}
