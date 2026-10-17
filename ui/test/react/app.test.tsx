// @vitest-environment jsdom
// App do desktop: login e cadastro com a ponte falsa, roteador por hash, permissões por papel, sidebar e a barreira de
// erro da tela de entrada.
import './setup';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeStore, user } from './fixtures';

const bridge = vi.hoisted(() => {
  const ok = <T extends object>(x: T) => Promise.resolve({ ok: true as const, ...x });
  const auth = {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(() => Promise.resolve({ ok: true })),
    onExpired: vi.fn(),
    updateMe: vi.fn(),
  };
  const admin = {
    listRoles: vi.fn(() => ok({ roles: [] })),
    listUsers: vi.fn(() => ok({ users: [], total: 0, limit: 20, offset: 0 })),
    getUser: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  };
  const st = {
    me: vi.fn(() => Promise.resolve({ ok: false, status: 0, error: 'x' })),
    ratingHistory: vi.fn(() => Promise.resolve({ ok: false, status: 0, error: 'x' })),
  };
  return { auth, admin, st };
});
vi.mock('../../src/desktop/bridge', () => ({
  LD: {},
  DESKTOP_AUTH: bridge.auth,
  DESKTOP_ADMIN: bridge.admin,
  DESKTOP_AI: undefined,
  DESKTOP_STATS: bridge.st,
  API_GAMES_STORE: undefined,
  API_GAMES: false,
}));
// a partida (Stockfish, bot, GameStore da API) não sobe nestes testes
vi.mock('../../src/boot', () => ({ bootApp: vi.fn() }));

const { App } = await import('../../src/app/app');
const { ErrorBoundary, authFallback } = await import('../../src/app/error-boundary');
const { ACCOUNT, initUserMenu, showAuth } = await import('../../src/desktop/account');
const { initSidebarControls } = await import('../../src/desktop/sidebar');
const { DEFAULT_VIEW, ROUTE, goView } = await import('../../src/desktop/views');
const { setGameStore } = await import('../../src/store/game-store');

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const visibleView = () => [...document.querySelectorAll<HTMLElement>('#appRoot > section.view')].filter((s) => !s.hidden).map((s) => s.dataset.view);

beforeAll(() => {
  document.getElementById('appRoot')?.remove(); // o #appRoot agora é o do App
  setGameStore(fakeStore([]));
  // montado fora do render() da Testing Library: o App fica de pé entre os testes (o cleanup não o desmonta)
  const host = document.createElement('div');
  host.id = 'app';
  document.body.appendChild(host);
  act(() => createRoot(host).render(<App />));
  // atalhos do document (main.tsx liga na mesma ordem)
  initUserMenu();
  initSidebarControls();
  act(() => showAuth('login'));
});

describe('tela de entrada', () => {
  it('abre no login com a área do app inerte', () => {
    expect(DEFAULT_VIEW).toBe('inicio');
    expect($('authScreen').hidden).toBe(false);
    expect($('loginForm').hidden).toBe(false);
    expect($('registerForm').hidden).toBe(true);
    expect($('appRoot').hasAttribute('inert')).toBe(true);
    expect(document.documentElement.classList.contains('needs-auth')).toBe(true);
    expect(document.activeElement).toBe($('loginEmail'));
  });
  it('cadastro: confere os campos e marca o e-mail já usado', async () => {
    const u = userEvent.setup();
    await u.click($('toRegister'));
    expect($('registerForm').hidden).toBe(false);
    expect(document.activeElement).toBe($('regFirst'));
    await u.click($('registerBtn'));
    expect($('registerMsg').textContent).toBe('Informe o nome.');
    expect($('regFirst').getAttribute('aria-invalid')).toBe('true');
    await u.type($('regFirst'), 'Ana');
    await u.type($('regLast'), 'Souza');
    await u.type($('regEmail'), 'ana@lance.local');
    await u.type($('regPass'), '12345678');
    await u.type($('regPass2'), '1234567x');
    await u.click($('registerBtn'));
    expect($('registerMsg').textContent).toBe('As senhas não conferem.');
    expect($('regFirst').hasAttribute('aria-invalid')).toBe(false);
    expect(document.activeElement).toBe($('regPass2'));
    bridge.auth.register.mockResolvedValueOnce({ ok: false, status: 409, error: 'Esse e-mail já tem conta.' });
    await u.clear($('regPass2'));
    await u.type($('regPass2'), '12345678');
    await u.click($('registerBtn'));
    await waitFor(() => expect($('registerMsg').textContent).toBe('Esse e-mail já tem conta.'));
    expect(bridge.auth.register).toHaveBeenCalledWith({ first_name: 'Ana', last_name: 'Souza', email: 'ana@lance.local', password: '12345678' });
    expect($('regEmail').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('regEmail'));
    expect($('registerBtn').textContent).toBe('Criar conta');
    await u.click($('toLogin'));
    expect($('loginForm').hidden).toBe(false);
  });
  it('login: campos obrigatórios, erro genérico da API e senha limpa', async () => {
    const u = userEvent.setup();
    await u.click($('loginBtn'));
    expect($('loginMsg').textContent).toBe('Informe o e-mail.');
    expect($('loginMsg').className).toBe('form-msg err');
    await u.type($('loginEmail'), 'ana@lance');
    await u.click($('loginBtn'));
    expect($('loginMsg').textContent).toBe('Esse e-mail não parece válido.');
    await u.clear($('loginEmail'));
    await u.type($('loginEmail'), 'ana@lance.local');
    await u.type($('loginPass'), 'errada');
    let done!: (v: unknown) => void;
    bridge.auth.login.mockReturnValueOnce(new Promise((r) => (done = r)));
    await u.click($('loginBtn'));
    expect($('loginBtn').textContent).toBe('Entrando…');
    expect(($('loginBtn') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => done({ ok: false, status: 429, error: 'x' }));
    expect($('loginMsg').textContent).toBe('Muitas tentativas seguidas. Espere um minuto e tente de novo.');
    expect($<HTMLInputElement>('loginPass').value).toBe('');
    expect(document.activeElement).toBe($('loginPass'));
    expect($('loginBtn').textContent).toBe('Entrar');
  });
  it('login certo: entra no Início, com a sidebar do papel', async () => {
    const u = userEvent.setup();
    bridge.auth.login.mockResolvedValueOnce({ ok: true, user: user('u1'), legacyId: null });
    await u.type($('loginPass'), 'certa123');
    await u.click($('loginBtn'));
    await waitFor(() => expect($('authScreen').hidden).toBe(true));
    expect(ACCOUNT.user!.id).toBe('u1');
    expect($('appRoot').hasAttribute('inert')).toBe(false);
    expect(document.documentElement.classList.contains('needs-auth')).toBe(false);
    expect(location.hash).toBe('#/inicio');
    expect(document.title).toBe('Lance a Lance');
    expect(visibleView()).toEqual(['inicio']);
    expect(document.documentElement.dataset.view).toBe('inicio');
    expect($('sidebar').hidden).toBe(false);
    expect([...document.querySelectorAll('#sideNav a')].map((a) => a.textContent)).toEqual([
      'Início',
      'Tabuleiro',
      'Aberturas',
      'Estatísticas',
      'Histórico',
    ]);
    expect(document.querySelector('#sideNav [aria-current="page"]')!.textContent).toBe('Início');
    expect($('sideUserName').textContent).toBe('Ana Souza');
    expect($('userInitials').textContent).toBe('AS');
    expect($('openAdmin').hidden).toBe(true);
    // telas do app e os modais delas já existem (os modais no fim de #appRoot, na ordem da árvore)
    expect(document.querySelector('section[data-view=inicio] #homeHello')).toBeTruthy();
    expect(document.querySelector('section[data-view=historico] #hpList')).toBeTruthy();
    expect(document.querySelector('section[data-view=admin] #adminRows')).toBeTruthy();
    expect(document.querySelector('section[data-view=estatisticas] #ratingChart')).toBeTruthy();
    expect([...document.querySelectorAll('#appRoot > .modal')].map((m) => m.id)).toEqual([
      'historyModal',
      'profileModal',
      'gameConfirmModal',
      'adminUserModal',
      'adminConfirmModal',
    ]);
  });
});

describe('roteador', () => {
  it('troca de tela pelo hash e marca o item da sidebar', async () => {
    location.hash = '#/estatisticas';
    await waitFor(() => expect(visibleView()).toEqual(['estatisticas']));
    expect(document.title).toBe('Estatísticas · Lance a Lance');
    expect(document.querySelector('#sideNav [aria-current="page"]')!.textContent).toBe('Estatísticas');
    act(() => goView('jogo'));
    expect(location.hash).toBe('#/jogo');
    expect(visibleView()).toEqual(['jogo']);
    expect(document.documentElement.dataset.view).toBe('jogo');
  });
  it('Aberturas mostra a tela do jogo com o endereço próprio', () => {
    act(() => goView('aberturas'));
    expect(location.hash).toBe('#/aberturas');
    expect(ROUTE).toEqual({ view: 'jogo', route: 'aberturas' });
    expect(visibleView()).toEqual(['jogo']);
    expect(document.title).toBe('Aberturas · Lance a Lance');
    expect(document.querySelector('#sideNav [aria-current="page"]')!.textContent).toBe('Aberturas');
    expect($('study').hidden).toBe(false);
  });
  it('sem permissão: volta ao Início com um aviso', async () => {
    location.hash = '#/admin';
    await waitFor(() => expect(location.hash).toBe('#/inicio'));
    expect(visibleView()).toEqual(['inicio']);
    expect($('viewToast').textContent).toBe('Você não tem permissão para abrir essa tela.');
  });
  it('rota desconhecida cai na tela padrão', async () => {
    location.hash = '#/nada';
    await waitFor(() => expect(location.hash).toBe('#/inicio'));
  });
  it('administrador vê Administração', async () => {
    act(() => {
      ACCOUNT.user = user('u2', { role: 'administrador', role_name: 'Administrador' });
      goView('admin');
    });
    expect(visibleView()).toEqual(['admin']);
    expect([...document.querySelectorAll('#sideNav a')].map((a) => a.textContent)).toContain('Administração');
    expect($('openAdmin').hidden).toBe(false);
    act(() => goView('inicio'));
  });
  it('sidebar: recolher guarda a escolha; menu da conta abre e fecha com Esc', async () => {
    const u = userEvent.setup();
    await u.click($('sideCollapse'));
    expect(document.documentElement.classList.contains('sb-collapsed')).toBe(true);
    expect(localStorage.getItem('lance-a-lance:sidebar:v1')).toBe('"recolhida"');
    expect($('sideCollapse').getAttribute('aria-label')).toBe('Expandir menu');
    expect(document.querySelector('#sideNav a')!.getAttribute('title')).toBe('Início');
    await u.click($('sideCollapse'));
    expect(document.documentElement.classList.contains('sb-collapsed')).toBe(false);
    await u.click($('openUser'));
    expect($('userPop').hidden).toBe(false);
    expect(document.activeElement).toBe($('userPop'));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect($('userPop').hidden).toBe(true);
    expect(document.activeElement).toBe($('openUser'));
  });
});

describe('barreira de erro', () => {
  it('um erro ao desenhar a entrada vira um aviso genérico com Recarregar', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Bomb = () => {
      throw new Error('falhou');
    };
    render(
      <ErrorBoundary fallback={authFallback}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível mostrar a tela de entrada. Recarregue para tentar de novo.');
    expect(screen.getByText('Recarregar')).toBeTruthy();
    expect(document.body.textContent).not.toContain('falhou');
    err.mockRestore();
  });
});
