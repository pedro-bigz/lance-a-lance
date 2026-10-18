// @vitest-environment jsdom
import './setup';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatingHistoryData } from '../../src/types/api';
import { stats } from './fixtures';

const bridge = vi.hoisted(() => {
  const state: { hist: RatingHistoryData | null; me: unknown } = { hist: null, me: null };
  const st = {
    me: vi.fn(() => Promise.resolve(state.me)),
    ratingHistory: vi.fn((_p: { tz: number; from?: string; group?: string }) =>
      Promise.resolve(state.hist ? { ok: true, ...state.hist } : { ok: false, status: 0, error: 'Sem conexão.' }),
    ),
  };
  return { state, st };
});
vi.mock('../../src/desktop/bridge', () => ({
  LD: undefined,
  DESKTOP_AUTH: undefined,
  DESKTOP_ADMIN: undefined,
  DESKTOP_AI: undefined,
  DESKTOP_STATS: bridge.st,
  API_GAMES_STORE: undefined,
  API_GAMES: false,
}));
const { StatsView } = await import('../../src/desktop/stats-view');
const { refreshView } = await import('../../src/desktop/views');

const day = 86400e3;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
beforeEach(() => {
  vi.clearAllMocks();
  bridge.state.me = { ok: true, stats: stats() };
  bridge.state.hist = {
    points: [
      { at: iso(5 * day), rating: 410, delta: 10, games: 1, reason: 'vitoria' },
      { at: iso(2 * day), rating: 400, delta: -10, games: 1, reason: 'derrota' },
      { at: iso(1 * day), rating: 410, delta: 10, games: 1, reason: 'vitoria' },
    ],
    start_rating: 400,
    current_rating: 410,
    from: null,
    to: null,
    group: null,
  };
});
async function open() {
  render(<StatsView />);
  act(() => refreshView('estatisticas'));
  await waitFor(() => expect(document.querySelector('#ratingChart svg, #ratingChart .rchart-empty')).toBeTruthy());
}

describe('Estatísticas', () => {
  it('cartões, tabela de classificações e subtítulo do gráfico', async () => {
    await open();
    await waitFor(() => expect(document.querySelectorAll('#statCards .stat-card').length).toBe(6));
    const cards = document.getElementById('statCards')!;
    expect(within(cards).getByText('410')).toBeTruthy();
    expect(within(cards).getByText('67% das partidas')).toBeTruthy();
    expect(document.querySelectorAll('#clsRows tr').length).toBe(10);
    // selo do livro é um SVG (não pode sair como texto)
    expect(document.querySelector('#clsRows tr:first-child .mini svg')).toBeTruthy();
    expect(document.querySelector('#clsRows tr:nth-child(2) .mini')!.textContent).toBe('!!');
    expect(screen.getByText('146 lances seus em 6 partidas avaliadas · média = lances ÷ partidas')).toBeTruthy();
    expect(document.getElementById('rchartSub')!.textContent).toBe('Agora: 410 · +10 no período');
    expect(document.querySelectorAll('#rcDots .dot').length).toBe(3);
    expect(document.querySelector('#ratingChart svg')!.getAttribute('aria-label')).toBe(
      'Pontuação de 400 para 410 no período, em 3 partida(s). Use as setas para percorrer os pontos.',
    );
  });
  it('períodos: 30 dias por partida, 90 por dia, 1 ano por semana, tudo sem data inicial', async () => {
    await open();
    expect(bridge.st.ratingHistory.mock.calls[0]![0]).not.toHaveProperty('group');
    expect(bridge.st.ratingHistory.mock.calls[0]![0]).toHaveProperty('from');
    const pick = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true');
      return bridge.st.ratingHistory.mock.calls.at(-1)![0];
    };
    expect((await pick('90 dias')).group).toBe('day');
    expect((await pick('1 ano')).group).toBe('week');
    const all = await pick('Tudo');
    expect(all.group).toBe('day');
    expect(all).not.toHaveProperty('from');
    const n = bridge.st.ratingHistory.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    expect(bridge.st.ratingHistory.mock.calls.length).toBe(n); // o mesmo período não recarrega
  });
  it('dica do ponto pelo teclado: setas, Home e Esc', async () => {
    await open();
    const svg = document.querySelector<SVGElement>('#ratingChart svg')!;
    const tip = document.getElementById('rcTip')!;
    expect(tip.hidden).toBe(true);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toMatch(/410Vitória · \+10$/);
    expect(document.querySelectorAll('#rcDots .dot.on').length).toBe(1);
    expect(document.getElementById('rcGuide')!.getAttribute('visibility')).toBe('visible');
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(tip.textContent).toMatch(/400Derrota · −10$/);
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(document.querySelector('#rcDots .dot.on')!.getAttribute('data-i')).toBe('0');
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(tip.hidden).toBe(true);
    expect(document.getElementById('rcGuide')!.getAttribute('visibility')).toBe('hidden');
  });
  it('sem partida valendo pontuação no período: estado vazio', async () => {
    bridge.state.hist = { points: [], start_rating: 400, current_rating: 400, from: null, to: null, group: null };
    await open();
    expect(screen.getByText('Nenhuma partida valendo pontuação nos últimos 30 dias')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Jogar uma partida' }).getAttribute('href')).toBe('#/jogo');
    expect(document.getElementById('rchartSub')!.textContent).toBe('Agora: 400');
  });
  it('erros: mensagem das estatísticas e do gráfico', async () => {
    bridge.state.hist = null;
    bridge.state.me = { ok: false, status: 0, error: 'Sem conexão.' };
    await open();
    expect(screen.getByText('Não foi possível carregar o gráfico')).toBeTruthy();
    await waitFor(() => expect(document.getElementById('statsMsg')!.textContent).toBe('Não foi possível carregar as estatísticas. Sem conexão.'));
    // sem dados: cartões em esqueleto
    expect(document.querySelectorAll('#statCards .stat-card.skel').length).toBe(6);
  });
});
