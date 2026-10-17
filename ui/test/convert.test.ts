import { describe, expect, it } from 'vitest';
import { START_FEN } from '../src/core/constants';
import { LEGACY_SID, UUID_RE, apiBody, apiMoves, clsFromApi, clsToApi, fromApi, trimHeaders } from '../src/store/convert';
import type { GameRecord } from '../src/store/types';
import type { ApiGame } from '../src/types/api';

const rec = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: 'gabc123',
  createdAt: Date.UTC(2026, 9, 1, 12),
  updatedAt: Date.UTC(2026, 9, 1, 13),
  mode: 'play',
  gameMode: 'normal',
  bot: 'mestre',
  player: 'b',
  orient: 'b',
  start: START_FEN,
  moves: ['e2e4', 'c7c5'],
  sans: ['e4', 'c5'],
  cls: ['livro', 'chance'],
  headers: {},
  ended: false,
  resigned: false,
  status: 'andamento',
  result: null,
  resultText: 'Em andamento',
  rated: true,
  apiResult: null,
  apiReason: null,
  pgn: '1. e4 c5 *',
  opening: 'Defesa Siciliana',
  ...over,
});

describe('classificação ↔ API', () => {
  it('chance vira chance_perdida e volta', () => {
    expect(clsToApi('chance')).toBe('chance_perdida');
    expect(clsToApi('melhor')).toBe('melhor');
    expect(clsToApi(null)).toBeNull();
    expect(clsFromApi('chance_perdida')).toBe('chance');
    expect(clsFromApi('erro')).toBe('erro');
    expect(clsFromApi(null)).toBeNull();
  });
  it('apiMoves junta uci, san e classificação', () => {
    expect(apiMoves(rec())).toEqual([
      { uci: 'e2e4', san: 'e4', cls: 'livro' },
      { uci: 'c7c5', san: 'c5', cls: 'chance_perdida' },
    ]);
    expect(apiMoves({ moves: ['e2e4'], sans: undefined, cls: null })).toEqual([{ uci: 'e2e4', san: null, cls: null }]);
  });
  it('trimHeaders limita quantidade e tamanho e descarta o que não é texto', () => {
    const h: Record<string, unknown> = { White: 'x'.repeat(300), Elo: 1500 };
    for (let i = 0; i < 30; i++) h['K' + i] = 'v';
    const out = trimHeaders(h);
    expect(out.White).toHaveLength(200);
    expect(out.Elo).toBeUndefined();
    expect(Object.keys(out).length).toBe(19);
    expect(trimHeaders(null)).toEqual({});
  });
});

describe('apiBody', () => {
  it('create: partida contra bot, valendo rating', () => {
    expect(apiBody(rec(), 'create')).toEqual({
      moves: apiMoves(rec()),
      pgn: '1. e4 c5 *',
      opening_name: 'Defesa Siciliana',
      status: 'em_andamento',
      result: null,
      result_reason: null,
      meta: { view: 'play', orient: 'b', headers: {}, result_text: 'Em andamento', local_result: null, ended: false, resigned: false },
      mode: 'normal',
      rated: true,
      client_ref: 'gabc123',
      opponent_type: 'bot',
      bot_level: 'mestre',
      color: 'b',
      start_fen: null,
      started_at: '2026-10-01T12:00:00.000Z',
    });
  });
  it('update não manda os campos de criação; done também não manda modo nem rating', () => {
    const upd = apiBody(rec({ status: 'concluida', result: 'derrota', apiResult: '1-0', apiReason: 'desistencia', resigned: true }), 'update');
    expect(upd).toMatchObject({ status: 'concluida', result: '1-0', result_reason: 'desistencia', mode: 'normal', rated: true });
    expect(upd.client_ref).toBeUndefined();
    const done = apiBody(rec({ status: 'concluida' }), 'done');
    expect(done.mode).toBeUndefined();
    expect(done.rated).toBeUndefined();
  });
  it('análise/revisão: assistido, sem bot, sem rating, lado branco e FEN inicial própria', () => {
    const fen = '8/8/8/8/8/8/R7/K6k w - - 0 1';
    const b = apiBody(rec({ mode: 'review', gameMode: 'normal', bot: 'none', start: fen }), 'create');
    expect(b).toMatchObject({ mode: 'assistido', rated: false, opponent_type: 'analise', bot_level: null, color: 'w', start_fen: fen });
  });
  it('rating só vale contra bot no modo normal', () => {
    expect(apiBody(rec({ gameMode: 'assistido' }), 'update').rated).toBe(false);
    expect(apiBody(rec({ bot: 'none' }), 'update').rated).toBe(false);
  });
});

describe('fromApi', () => {
  const game: ApiGame = {
    id: '0199a0b1-2c3d-7e4f-8a5b-6c7d8e9f0a1b',
    client_ref: 'gabc123',
    color: 'b',
    bot_level: 'mestre',
    mode: 'normal',
    status: 'concluida',
    result: '1-0',
    result_reason: 'desistencia',
    outcome: 'derrota',
    opening_name: 'Defesa Siciliana',
    ply_count: 2,
    rated: true,
    rating_delta: -10,
    meta: { view: 'play', orient: 'b', headers: { White: 'Bot Mestre' }, ended: false, resigned: true },
    started_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T13:00:00.000Z',
    start_fen: null,
    moves: [
      { uci: 'e2e4', san: 'e4', cls: 'livro' },
      { uci: 'c7c5', san: 'c5', cls: 'chance_perdida' },
    ],
  };
  it('converte a partida completa', () => {
    expect(fromApi(game)).toEqual({
      id: 'gabc123',
      serverId: game.id,
      createdAt: Date.UTC(2026, 9, 1, 12),
      updatedAt: Date.UTC(2026, 9, 1, 13),
      mode: 'play',
      gameMode: 'normal',
      bot: 'mestre',
      player: 'b',
      orient: 'b',
      start: START_FEN,
      moves: ['e2e4', 'c7c5'],
      cls: ['livro', 'chance'],
      plyCount: 2,
      headers: { White: 'Bot Mestre' },
      ended: false,
      resigned: true,
      status: 'concluida',
      result: 'derrota',
      resultText: 'Desistência',
      rated: true,
      ratingDelta: -10,
      opening: 'Defesa Siciliana',
    });
  });
  it('item resumido da listagem e partida sem client_ref', () => {
    const r = fromApi({ ...game, client_ref: null, moves: undefined, meta: null, status: 'em_andamento', color: null, bot_level: null });
    expect(r).toMatchObject({
      id: 's' + game.id,
      moves: null,
      cls: null,
      status: 'andamento',
      result: null,
      bot: 'none',
      player: 'w',
      orient: 'w',
      resultText: 'Desistência',
    });
  });
  it('resultado local gravado em meta tem preferência sobre o outcome da API', () => {
    expect(fromApi({ ...game, meta: { local_result: 'encerrada', result_text: 'Partida encerrada pelo jogador' } })).toMatchObject({
      result: 'encerrada',
      resultText: 'Partida encerrada pelo jogador',
    });
  });
});

describe('ids', () => {
  it('UUID_RE aceita só UUID canônico (versão 1 a 8, variante RFC), em minúsculas', () => {
    expect(UUID_RE.test('0199a0b1-2c3d-7e4f-8a5b-6c7d8e9f0a1b')).toBe(true);
    expect(UUID_RE.test('0199A0B1-2C3D-7E4F-8A5B-6C7D8E9F0A1B')).toBe(false);
    expect(UUID_RE.test('0199a0b1-2c3d-0e4f-8a5b-6c7d8e9f0a1b')).toBe(false);
    expect(UUID_RE.test('0199a0b1-2c3d-7e4f-ca5b-6c7d8e9f0a1b')).toBe(false);
    expect(UUID_RE.test('42')).toBe(false);
  });
  it('LEGACY_SID reconhece o id local antigo (s + número)', () => {
    expect(LEGACY_SID.test('s42')).toBe(true);
    expect(LEGACY_SID.test('s0199a0b1-2c3d-7e4f-8a5b-6c7d8e9f0a1b')).toBe(false);
    expect(LEGACY_SID.test('gabc')).toBe(false);
  });
});
