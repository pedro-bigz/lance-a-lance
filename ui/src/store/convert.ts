// Conversão entre o formato do histórico (rec) e o da API (veja api/README.md). Puro: sem DOM nem estado global.
import { START_FEN, type ClsKey } from '../core/constants';
import type { ApiGame, ApiGameBody, ApiMove } from '../types/api';
import type { GameRecord } from './types';

export const clsToApi = (k: ClsKey | null | undefined): string | null => (!k ? null : k === 'chance' ? 'chance_perdida' : k);
export const clsFromApi = (k: string | null | undefined): ClsKey | null => (!k ? null : k === 'chance_perdida' ? 'chance' : (k as ClsKey));
export const REASON_TEXT: Record<string, string> = {
  xeque_mate: 'Xeque-mate',
  desistencia: 'Desistência',
  afogamento: 'Empate por afogamento',
  repeticao: 'Empate por repetição',
  material_insuficiente: 'Empate por material insuficiente',
  regra_50_lances: 'Empate pela regra dos 50 lances',
  encerrada: 'Partida encerrada pelo jogador',
  importada: 'Partida importada',
};
export const apiMoves = (rec: Pick<GameRecord, 'moves' | 'sans' | 'cls'>): ApiMove[] =>
  (rec.moves as string[]).map((u, i) => ({ uci: u, san: (rec.sans && rec.sans[i]) || null, cls: clsToApi(rec.cls && rec.cls[i]) }));
export function trimHeaders(h: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {}).slice(0, 20)) if (typeof v === 'string') out[String(k).slice(0, 40)] = v.slice(0, 200);
  return out;
}
// kind: 'create' (primeira gravação), 'update' (em andamento) ou 'done' (já concluída na API: modo e rating não mudam mais)
export function apiBody(rec: GameRecord, kind: 'create' | 'update' | 'done'): ApiGameBody {
  const review = rec.mode === 'review',
    bot = !review && !!rec.bot && rec.bot !== 'none';
  const body: ApiGameBody = {
    moves: apiMoves(rec),
    pgn: rec.pgn || null,
    opening_name: rec.opening || null,
    status: rec.status === 'concluida' ? 'concluida' : 'em_andamento',
    result: rec.apiResult || null,
    result_reason: rec.apiReason || null,
    meta: {
      view: rec.mode,
      orient: rec.orient,
      headers: trimHeaders(rec.headers),
      result_text: rec.resultText || null,
      local_result: rec.result || null,
      ended: !!rec.ended,
      resigned: !!rec.resigned,
    },
  };
  if (kind !== 'done') {
    body.mode = review ? 'assistido' : rec.gameMode;
    body.rated = !!rec.rated && bot && rec.gameMode === 'normal';
  }
  if (kind === 'create')
    Object.assign(body, {
      client_ref: rec.id,
      opponent_type: bot ? 'bot' : 'analise',
      bot_level: bot ? rec.bot : null,
      color: review ? 'w' : rec.player,
      start_fen: rec.start && rec.start !== START_FEN ? rec.start : null,
      started_at: new Date(rec.createdAt || Date.now()).toISOString(),
    });
  return body;
}
// ids da API (usuário e partida) são UUID; o id numérico do banco nunca chega ao app
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// id local de uma partida que só existe na API (sem client_ref): 's' + uuid
export const LEGACY_SID = /^s\d+$/; // 's' + id numérico, de antes dos uuids: não serve mais
export function fromApi(g: ApiGame): GameRecord {
  const m = g.meta || {},
    mv = Array.isArray(g.moves) ? g.moves : null;
  const done = g.status === 'concluida';
  return {
    id: g.client_ref || 's' + g.id,
    serverId: g.id,
    createdAt: Date.parse(g.started_at) || Date.now(),
    updatedAt: Date.parse(g.updated_at) || Date.now(),
    mode: m.view === 'review' ? 'review' : 'play',
    gameMode: g.mode === 'normal' ? 'normal' : 'assistido',
    bot: g.bot_level || 'none',
    player: g.color === 'b' ? 'b' : 'w',
    orient: m.orient === 'b' || m.orient === 'w' ? m.orient : g.color || 'w',
    start: g.start_fen || START_FEN,
    moves: mv ? mv.map((x) => x.uci) : null,
    cls: mv ? mv.map((x) => clsFromApi(x.cls)) : null,
    plyCount: g.ply_count,
    headers: m.headers || {},
    ended: !!m.ended,
    resigned: !!m.resigned,
    status: done ? 'concluida' : 'andamento',
    result: done ? ((m.local_result || g.outcome || 'livre') as GameRecord['result']) : null,
    resultText: m.result_text || REASON_TEXT[g.result_reason as string] || '',
    rated: !!g.rated,
    ratingDelta: g.rating_delta,
    opening: g.opening_name,
  };
}
