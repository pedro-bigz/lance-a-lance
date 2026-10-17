// @vitest-environment jsdom
import './setup';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStore, game, stats, user } from './fixtures';

const bridge = vi.hoisted(() => {
  const state: { me: unknown } = { me: null };
  const st = { me: vi.fn(() => Promise.resolve(state.me)), ratingHistory: vi.fn() };
  const auth = {
    me: vi.fn(),
    updateMe: vi.fn((d: Record<string, string>) =>
      d.current_password === 'errada'
        ? Promise.resolve({ ok: false, status: 400, error: 'A senha atual não confere.' })
        : Promise.resolve({
            ok: true,
            user: {
              id: 'u1',
              first_name: d.first_name || 'Ana',
              last_name: 'Souza',
              email: 'u1@lance.local',
              role: 'jogador',
              active: true,
              forbidden: false,
              created_at: '',
            },
            passwordChanged: !!d.password,
          }),
    ),
  };
  return { state, st, auth };
});
vi.mock('../../src/desktop/bridge', () => ({
  LD: undefined,
  DESKTOP_AUTH: bridge.auth,
  DESKTOP_ADMIN: undefined,
  DESKTOP_AI: undefined,
  DESKTOP_STATS: bridge.st,
  API_GAMES_STORE: undefined,
  API_GAMES: false,
}));
const { HomeView } = await import('../../src/desktop/home-view');
const { ProfileView } = await import('../../src/desktop/profile-view');
const { openProfile } = await import('../../src/desktop/profile');
const { refreshView } = await import('../../src/desktop/views');
const { ACCOUNT } = await import('../../src/desktop/account');
const { setGameStore } = await import('../../src/store/game-store');
const { TopBar } = await import('../../src/game/top-bar');
const { Sidebar } = await import('../../src/desktop/sidebar-view');
const { SIDEBAR } = await import('../../src/desktop/sidebar');

beforeEach(() => {
  vi.clearAllMocks();
  ACCOUNT.user = user('u1');
  bridge.state.me = { ok: true, stats: stats() };
});

describe('Início', () => {
  it('antes de abrir: o HTML vazio de antes', () => {
    setGameStore(fakeStore([]));
    render(<HomeView />);
    // (a versão do tópico pode já ter sido emitida em outro teste; aqui só a marcação base)
    expect(document.getElementById('homeSub')!.textContent).toMatch(/^Jogue contra um bot/);
  });
  it('com dados: saudação, pontuação, resumo, partida em andamento e últimas partidas', async () => {
    setGameStore(fakeStore([game('a'), game('b', { status: 'andamento', result: null, resultText: '', updatedAt: Date.UTC(2026, 9, 2, 12) })]));
    render(
      <>
        <TopBar />
        <HomeView />
      </>,
    );
    act(() => refreshView('inicio'));
    await waitFor(() => expect(document.querySelectorAll('#homeRecent .hist-item').length).toBe(2));
    expect(document.getElementById('homeHello')!.textContent).toMatch(/^(Bom dia|Boa tarde|Boa noite), Ana$/);
    expect(document.getElementById('homeRating')!.textContent).toBe('410');
    expect(document.getElementById('homeRec')!.textContent).toMatch(/^Bot recomendado: .+ \(≈\d+\)$/);
    expect(document.getElementById('ratingVal')!.textContent).toBe('410');
    const sum = document.getElementById('homeSummary')!;
    expect(within(sum).getByText('6 partidas com resultado · 67% de vitórias')).toBeTruthy();
    expect(sum.querySelectorAll('.wdl-bar i').length).toBe(3);
    await waitFor(() => expect(document.getElementById('homeContinueBtn')).toBeTruthy());
    const cont = document.getElementById('homeContinue')!;
    expect(cont.className).toBe('card home-continue');
    expect(cont.querySelectorAll('.mini-board i').length).toBe(64);
    expect(within(cont).getByText('Brancas · 5 lances · Modo normal · vale pontuação')).toBeTruthy();
    expect(document.getElementById('homeContinueBtn')!.getAttribute('data-cont')).toBe('b');
  });
  it('sem partidas: estados vazios', async () => {
    setGameStore(fakeStore([]));
    bridge.state.me = { ok: true, stats: stats({ games_played: 0, wins: 0, losses: 0, draws: 0 }) };
    render(<HomeView />);
    act(() => refreshView('inicio'));
    await waitFor(() => expect(screen.getByText('Nenhuma partida ainda. Comece uma e ela aparece aqui sozinha.')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Nenhuma partida contra bot em andamento')).toBeTruthy());
    expect(document.getElementById('homeContinue')!.className).toBe('card home-continue empty');
    expect(screen.getByText('Nenhuma partida com resultado ainda. Vitória, derrota e empate contra bot entram aqui.')).toBeTruthy();
  });
  it('servidor fora: avisos de erro', async () => {
    setGameStore(fakeStore([], { fail: true }));
    bridge.state.me = { ok: false, status: 0, error: 'x' };
    render(<HomeView />);
    act(() => refreshView('inicio'));
    await waitFor(() => expect(screen.getByText('Não foi possível carregar as partidas agora.')).toBeTruthy());
    expect(document.getElementById('homeMsg')!.textContent).toMatch(/^Não foi possível conectar ao servidor: o resumo pode estar incompleto/);
    expect(screen.getByText('Não foi possível carregar o resumo agora.')).toBeTruthy();
  });
});

describe('Perfil', () => {
  it('abre preenchido com foco no nome, valida, salva e Esc fecha devolvendo o foco ao avatar', async () => {
    SIDEBAR.shown = true; // o avatar (#openUser) fica na sidebar, que aparece depois do login
    render(
      <>
        <Sidebar />
        <ProfileView />
      </>,
    );
    const modal = document.getElementById('profileModal')!;
    expect(modal.hidden).toBe(true);
    act(() => openProfile());
    expect(modal.hidden).toBe(false);
    expect(document.activeElement!.id).toBe('pfFirst');
    expect((document.getElementById('pfEmail') as HTMLInputElement).value).toBe('u1@lance.local');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar alterações' }));
    expect(document.getElementById('profileMsg')!.textContent).toBe('Nada mudou no seu perfil.');
    await userEvent.type(document.getElementById('pfNew')!, '12345678');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar alterações' }));
    expect(document.getElementById('profileMsg')!.textContent).toBe('Para trocar a senha, informe a senha atual.');
    expect(document.activeElement!.id).toBe('pfCur');
    expect(document.getElementById('pfCur')!.getAttribute('aria-invalid')).toBe('true');
    await userEvent.type(document.getElementById('pfCur')!, 'errada');
    await userEvent.type(document.getElementById('pfNew2')!, '12345678');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(document.getElementById('profileMsg')!.textContent).toBe('A senha atual não confere.'));
    expect(document.activeElement!.id).toBe('pfCur');
    await userEvent.clear(document.getElementById('pfCur')!);
    await userEvent.type(document.getElementById('pfCur')!, 'certa123');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(document.getElementById('profileMsg')!.textContent).toBe('Perfil salvo e senha trocada.'));
    expect(bridge.auth.updateMe).toHaveBeenLastCalledWith({ password: '12345678', current_password: 'certa123' });
    expect((document.getElementById('pfNew') as HTMLInputElement).value).toBe('');
    expect(document.getElementById('userName')!.textContent).toBe('Ana Souza');
    await userEvent.keyboard('{Escape}');
    expect(modal.hidden).toBe(true);
    expect(document.activeElement!.id).toBe('openUser');
  });
});
