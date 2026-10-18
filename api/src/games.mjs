// Partidas: criar, atualizar (lances, PGN, estado), listar, ler e excluir — sempre do usuário logado
// (administrador pode ler as de qualquer usuário com ?user_id=). Ao concluir, soma o resultado e os lances em
// player_stats numa transação que trava a linha da partida (concluir duas vezes não conta duas vezes). Se a partida
// vale pontuação, a conclusão só marca a pontuação como pendente (rating_status = 'pending'); depois do commit a
// partida entra na fila de análise (src/rating/), que roda o Stockfish no servidor e aplica o delta (nunca o cliente).
// Para fora da API, partidas e usuários são identificados pelo uuid; o id numérico (games.id, users.id) fica aqui dentro.
import { fail, readJson, send } from './http.mjs';
import { requireUser } from './auth.mjs';
import { query, transaction } from './db.mjs';
import { ROLES } from './config.mjs';
import * as users from './user-store.mjs';
import { uuidv7, isUuid, toBin, fromBin, fromBinOrNull } from './uuid.mjs';
import { CLS_COLUMNS, CLASSIFICATIONS, CLS_ALIAS } from './move-classes.mjs';
import { RATING_START as START, RATING_MIN as MIN, BOT_ELO } from '../../shared/rating.mjs';
import { MAX_ATTEMPTS, ratingQueue } from './rating/index.mjs';

const POOL = { query };
const MAX_BODY = 256 * 1024;
const MAX_PGN = 20000;
const MAX_MOVES = 1000;
const MAX_META = 8 * 1024;

// classificações de lance (valores de moves[].cls) e a coluna de player_stats de cada uma: veja move-classes.mjs

// pontuação inicial e mínima: as mesmas da fórmula (shared/rating.mjs); os pontos de cada partida vêm de src/rating/
export const RATING_START = START;
export const RATING_MIN = MIN;

// níveis do bot: os da tabela de Elo da fórmula (BOT_ELO, o mesmo Elo nominal da interface)
export const BOT_LEVELS = Object.keys(BOT_ELO);
const OPPONENTS = ['bot', 'humano', 'analise'];
const MODES = ['normal', 'assistido'];
const STATUSES = ['em_andamento', 'concluida', 'abandonada'];
const RESULTS = ['1-0', '0-1', '1/2-1/2'];
const REASONS = ['xeque_mate', 'desistencia', 'afogamento', 'repeticao', 'material_insuficiente', 'regra_50_lances', 'encerrada', 'importada', 'tempo', 'acordo'];
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const FEN_RE = /^[1-8pnbrqkPNBRQK/]{15,71} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/;
const REF_RE = /^[A-Za-z0-9_-]{4,40}$/;

const iso = (d) => d instanceof Date ? d.toISOString() : d;
const parseJson = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (_) { return null; } };

// ---------- Validação ----------
function oneOf(v, list, label) {
  if (typeof v !== 'string' || !list.includes(v)) fail(422, `${label} inválido. Use ${list.join(', ')}.`);
  return v;
}
function bool(v, label) {
  if (v === true || v === 1) return 1;
  if (v === false || v === 0) return 0;
  fail(422, `${label} deve ser true ou false.`);
}
function text(v, max, label) {
  if (v === null) return null;
  if (typeof v !== 'string') fail(422, `${label} deve ser texto.`);
  if (v.length > max) fail(422, `${label} pode ter no máximo ${max} caracteres.`);
  return v;
}
function moves(v) {
  if (!Array.isArray(v)) fail(422, 'moves deve ser uma lista de lances.');
  if (v.length > MAX_MOVES) fail(422, `Uma partida pode ter no máximo ${MAX_MOVES} lances.`);
  return v.map((m, i) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) fail(422, `Lance ${i + 1} inválido.`);
    if (typeof m.uci !== 'string' || !UCI_RE.test(m.uci)) fail(422, `Lance ${i + 1}: uci inválido.`);
    if (m.san != null && (typeof m.san !== 'string' || m.san.length > 12)) fail(422, `Lance ${i + 1}: san inválido.`);
    let cls = m.cls == null ? null : CLS_ALIAS[m.cls] || m.cls;
    if (cls != null && !CLASSIFICATIONS.includes(cls)) fail(422, `Lance ${i + 1}: classificação inválida.`);
    return { uci: m.uci, san: m.san || null, cls };
  });
}
function meta(v) {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(422, 'meta deve ser um objeto.');
  if (JSON.stringify(v).length > MAX_META) fail(422, `meta pode ter no máximo ${MAX_META / 1024} KB.`);
  return v;
}
function startedAt(v) {
  const t = Date.parse(v);
  const now = Date.now();
  if (typeof v !== 'string' || !Number.isFinite(t)) fail(422, 'started_at deve ser uma data ISO.');
  return new Date(Math.min(now, Math.max(now - 400 * 86400e3, t)));
}

// campos editáveis (POST e PATCH) e os que só existem na criação
const EDIT = {
  moves, meta,
  pgn: v => text(v, MAX_PGN, 'pgn'),
  opening_name: v => text(v, 160, 'opening_name'),
  status: v => oneOf(v, STATUSES, 'status'),
  result: v => v === null ? null : oneOf(v, RESULTS, 'result'),
  result_reason: v => v === null ? null : oneOf(v, REASONS, 'result_reason'),
  mode: v => oneOf(v, MODES, 'mode'),
  rated: v => bool(v, 'rated'),
};
const CREATE = {
  client_ref: v => { if (typeof v !== 'string' || !REF_RE.test(v)) fail(422, 'client_ref inválido.'); return v; },
  opponent_type: v => oneOf(v, OPPONENTS, 'opponent_type'),
  bot_level: v => v === null ? null : oneOf(v, BOT_LEVELS, 'bot_level'),
  color: v => oneOf(v, ['w', 'b'], 'color'),
  start_fen: v => { if (v === null) return null; if (typeof v !== 'string' || !FEN_RE.test(v.trim())) fail(422, 'start_fen inválido.'); return v.trim(); },
  started_at: startedAt,
};
function pick(body, specs) {
  const out = {};
  for (const [k, fn] of Object.entries(specs)) if (body[k] !== undefined) out[k] = fn(body[k]);
  return out;
}
function rejectUnknown(body, allowed) {
  const extra = Object.keys(body).filter(k => !allowed.includes(k));
  if (extra.length) fail(422, `Campo não permitido: ${extra.join(', ')}.`);
}
function intParam(v, def, min, max) {
  if (v == null || v === '') return def;
  if (!/^\d+$/.test(v)) fail(400, 'Parâmetro numérico inválido.');
  return Math.min(max, Math.max(min, Number(v)));
}

// de quem são os dados: o próprio usuário ou, para administradores, ?user_id=<uuid>.
// uid é o id interno (para as consultas); uuid é o que volta nas respostas
export async function targetUser(req, url) {
  const me = await requireUser(req);
  const raw = url && url.searchParams.get('user_id');
  const mine = users.publicId(me);
  if (raw == null || raw === '' || raw === mine) return { me, uid: String(me.id), uuid: mine };
  if (me.role !== ROLES.ADMIN) fail(403, 'Só administradores podem ver dados de outro usuário.');
  const u = await users.findByUuid(raw);
  if (!u) fail(404, 'Usuário não encontrado.');
  return { me, uid: String(u.id), uuid: raw };
}

// ---------- Leitura ----------
// white_uuid/black_uuid: o uuid de cada lado (LEFT JOIN em users, veja FROM_GAMES)
const SUMMARY = 'g.id, g.uuid, wu.uuid AS white_uuid, bu.uuid AS black_uuid, g.client_ref, g.white_user_id, g.black_user_id, g.opponent_type, g.bot_level, g.mode, g.status, g.result, g.result_reason, g.opening_name, g.ply_count, g.rated, g.rating_delta, g.rating_status, g.rating_attempts, g.player_accuracy, g.meta, g.started_at, g.finished_at, g.created_at, g.updated_at';
const FULL = `${SUMMARY}, g.start_fen, g.pgn, g.moves`;
const FROM_GAMES = 'games g LEFT JOIN users wu ON wu.id = g.white_user_id LEFT JOIN users bu ON bu.id = g.black_user_id';

const colorOf = (g, uid) => String(g.white_user_id) === String(uid) ? 'w' : String(g.black_user_id) === String(uid) ? 'b' : null;
function outcomeFor(result, color) {
  if (!result || !color) return null;
  if (result === '1/2-1/2') return 'empate';
  return (result === '1-0') === (color === 'w') ? 'vitoria' : 'derrota';
}

// estado da pontuação para fora: 'pending' (na fila ou esperando nova tentativa), 'applied', 'failed' (desistiu
// depois de MAX_ATTEMPTS) ou null (não vale pontuação, ou foi calculada antes da análise pelo Stockfish)
export function ratingStatusOf(g) {
  if (g.rating_status === 'failed') return Number(g.rating_attempts) >= MAX_ATTEMPTS ? 'failed' : 'pending';
  return g.rating_status || null;
}

export function publicGame(g, uid, full = false) {
  const color = colorOf(g, uid);
  const out = {
    id: fromBin(g.uuid), client_ref: g.client_ref,
    white_user_id: fromBinOrNull(g.white_uuid),
    black_user_id: fromBinOrNull(g.black_uuid),
    color, opponent_type: g.opponent_type, bot_level: g.bot_level, mode: g.mode, status: g.status,
    result: g.result, result_reason: g.result_reason, outcome: outcomeFor(g.result, color),
    opening_name: g.opening_name, ply_count: Number(g.ply_count), rated: !!g.rated,
    rating_delta: g.rating_delta == null ? null : Number(g.rating_delta),
    rating_status: ratingStatusOf(g),
    player_accuracy: g.player_accuracy == null ? null : Number(g.player_accuracy),
    meta: parseJson(g.meta),
    started_at: iso(g.started_at), finished_at: iso(g.finished_at), created_at: iso(g.created_at), updated_at: iso(g.updated_at),
  };
  if (full) Object.assign(out, { start_fen: g.start_fen, pgn: g.pgn, moves: parseJson(g.moves) || [] });
  return out;
}

// id interno; FOR UPDATE OF g trava só a partida (não as contas do JOIN)
async function findGame(id, db = POOL, lock = false) {
  const rows = await db.query(`SELECT ${FULL}, g.stats_applied, g.counted_moves FROM ${FROM_GAMES} WHERE g.id = ?${lock ? ' FOR UPDATE OF g' : ''}`, [id]);
  return rows[0] || null;
}
// :id da rota é o uuid; formato inválido e partida inexistente dão o mesmo 404
async function findByUuid(raw) {
  if (!isUuid(raw)) fail(404, 'Partida não encontrada.');
  const rows = await query(`SELECT ${FULL}, g.stats_applied, g.counted_moves FROM ${FROM_GAMES} WHERE g.uuid = ?`, [toBin(raw)]);
  if (!rows[0]) fail(404, 'Partida não encontrada.');
  return rows[0];
}
const isOwner = (g, uid) => colorOf(g, uid) !== null;

// lista resumida (sem lances nem PGN) para o histórico, da mais recente para a mais antiga
export async function listGames(uid, { status = null, limit = 20, offset = 0 } = {}) {
  const where = ['(g.white_user_id = ? OR g.black_user_id = ?)'], params = [uid, uid];
  if (status) { where.push('g.status = ?'); params.push(status); }
  const w = where.join(' AND ');
  const rows = await query(`SELECT ${SUMMARY} FROM ${FROM_GAMES} WHERE ${w} ORDER BY g.updated_at DESC, g.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM games g WHERE ${w}`, params);
  return { games: rows.map(g => publicGame(g, uid)), total: Number(total), limit, offset };
}

export async function list(req, res, url) {
  const { uid } = await targetUser(req, url);
  const st = url.searchParams.get('status');
  const status = st ? oneOf(st, STATUSES, 'status') : null;
  const limit = intParam(url.searchParams.get('limit'), 20, 1, 100);
  const offset = intParam(url.searchParams.get('offset'), 0, 0, 1e9);
  return send(res, 200, { ok: true, ...(await listGames(uid, { status, limit, offset })) });
}

export async function getOne(req, res, rawId) {
  const me = await requireUser(req);
  const g = await findByUuid(rawId);
  if (!isOwner(g, me.id) && me.role !== ROLES.ADMIN) fail(404, 'Partida não encontrada.');
  return send(res, 200, { ok: true, game: publicGame(g, isOwner(g, me.id) ? me.id : (g.white_user_id || g.black_user_id), true) });
}

// ---------- Estatísticas (dentro da transação da conclusão) ----------
// garante a linha de player_stats (400 e o ponto inicial do histórico) para usuários criados depois da migração
export async function ensureStats(db, uid) {
  const r = await db.query('INSERT IGNORE INTO player_stats (user_id, rating) VALUES (?, ?)', [uid, RATING_START]);
  if (r.affectedRows) await db.query('INSERT INTO rating_history (user_id, game_id, rating_before, rating_after, delta, reason) VALUES (?, NULL, ?, ?, 0, ?)', [uid, RATING_START, RATING_START, 'inicial']);
}

// cor de quem joga o lance i (a posição inicial pode ter as pretas na vez)
function plyColor(startFen, i) {
  const first = startFen && startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  return i % 2 === 0 ? first : (first === 'w' ? 'b' : 'w');
}
function countMoves(g, list) {
  const out = { w: { total: 0 }, b: { total: 0 } };
  (list || []).forEach((m, i) => {
    if (!m || !m.cls) return;
    const c = out[plyColor(g.start_fen, i)];
    c[m.cls] = (c[m.cls] || 0) + 1; c.total++;
  });
  return out;
}
const effectiveRated = (g) => !!g.rated && g.opponent_type === 'bot' && g.mode === 'normal';

// soma no player_stats o que esta partida ainda não somou: o resultado (uma vez só) e a diferença entre os
// lances classificados agora e os já contados (assim classificações que chegam depois não duplicam)
async function applyConclusion(db, g, list) {
  const sides = [['w', g.white_user_id], ['b', g.black_user_id]].filter(([, id]) => id != null);
  for (const [, uid] of sides) await ensureStats(db, uid);
  // trava as linhas de player_stats de quem jogou (a fila de pontuação trava a mesma linha ao aplicar o delta)
  for (const [, uid] of sides) await db.query('SELECT user_id FROM player_stats WHERE user_id = ? FOR UPDATE', [uid]);
  const counts = g.opponent_type !== 'analise';
  const changes = { stats_applied: g.stats_applied ? 1 : 0, rating_delta: g.rating_delta, rating_status: g.rating_status, counted_moves: parseJson(g.counted_moves) };
  if (!g.stats_applied) {
    for (const [color, uid] of sides) {
      const out = counts ? outcomeFor(g.result, color) : null;
      if (out) {
        const col = out === 'vitoria' ? 'wins' : out === 'derrota' ? 'losses' : 'draws';
        await db.query(`UPDATE player_stats SET games_played = games_played + 1, ${col} = ${col} + 1 WHERE user_id = ?`, [uid]);
      }
      // vale pontuação: fica pendente; a fila de análise (src/rating/) calcula e aplica depois do commit
      if (out && effectiveRated(g) && g.bot_level) {
        changes.rating_status = 'pending';
        changes.rating_delta = null;
        changes.queued = true;
      }
    }
    changes.stats_applied = 1;
  }
  if (counts) {
    const now = countMoves(g, list), old = changes.counted_moves || { w: {}, b: {} };
    for (const [color, uid] of sides) {
      const a = now[color], b = old[color] || {};
      const sets = [], params = [];
      // a, b: contagens por classificação (chaves = valores de cls, como em counted_moves); col: coluna de player_stats
      for (const k of [...CLASSIFICATIONS, 'total']) {
        const d = (a[k] || 0) - (b[k] || 0);
        if (!d) continue;
        const col = k === 'total' ? 'total_moves' : CLS_COLUMNS[k];
        sets.push(`${col} = GREATEST(CAST(${col} AS SIGNED) + ?, 0)`); params.push(d);
      }
      const dg = ((a.total || 0) > 0 ? 1 : 0) - ((b.total || 0) > 0 ? 1 : 0);
      if (dg) { sets.push('games_classified = GREATEST(CAST(games_classified AS SIGNED) + ?, 0)'); params.push(dg); }
      if (sets.length) await db.query(`UPDATE player_stats SET ${sets.join(', ')} WHERE user_id = ?`, [...params, uid]);
    }
    changes.counted_moves = now;
  }
  await db.query('UPDATE games SET stats_applied = ?, rating_delta = ?, rating_status = ?, counted_moves = ? WHERE id = ?',
    [changes.stats_applied, changes.rating_delta ?? null, changes.rating_status ?? null, JSON.stringify(changes.counted_moves || null), g.id]);
  return !!changes.queued;
}

// a mudança de pontuação desta partida para o usuário (para a animação de +/− do app):
//   aplicada → {status: 'applied', before, after, delta, accuracy, bot_elo, expected_score, engine_version};
//   pendente → {status: 'pending', before, after, delta: 0} com before = after = pontuação atual (um app antigo, que
//   não olha o status, só vê "sem mudança"); falhou de vez → {status: 'failed', …, delta: 0}; não vale → null.
// Partidas de antes da análise pelo Stockfish (+10/−10) saem como aplicadas, com accuracy null.
async function ratingChange(gameId, uid, db = POOL) {
  const [g] = await db.query('SELECT rating_status, rating_attempts, player_accuracy, bot_elo, expected_score, engine_version FROM games WHERE id = ?', [gameId]);
  const [s] = await db.query('SELECT rating FROM player_stats WHERE user_id = ?', [uid]);
  const rating = s ? Number(s.rating) : RATING_START;
  const status = g ? ratingStatusOf(g) : null;
  if (status === 'pending' || status === 'failed') return { change: { status, before: rating, after: rating, delta: 0 }, rating };
  const [h] = await db.query('SELECT rating_before, rating_after, delta FROM rating_history WHERE game_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [gameId, uid]);
  if (!h) return { change: null, rating };
  const num = (v) => (v == null ? null : Number(v));
  return {
    change: {
      status: 'applied', before: Number(h.rating_before), after: Number(h.rating_after), delta: Number(h.delta),
      accuracy: num(g && g.player_accuracy), bot_elo: num(g && g.bot_elo), expected_score: num(g && g.expected_score),
      engine_version: (g && g.engine_version) || null,
    },
    rating,
  };
}

// ---------- Escrita ----------
// regras de transição: concluída é final (só aceita as classificações que faltavam nos lances)
function mergeUpdate(g, ch) {
  const out = {};
  const stored = parseJson(g.moves) || [];
  if (g.status === 'concluida') {
    // reenviar os mesmos valores é aceito (o app manda a partida inteira a cada gravação); mudar não
    for (const k of ['status', 'result', 'result_reason', 'mode']) {
      if (ch[k] == null) continue;
      if (g[k] !== ch[k]) fail(409, 'A partida já foi concluída e não pode mais ser alterada.');
    }
    if (ch.moves) {
      if (ch.moves.length !== stored.length || ch.moves.some((m, i) => m.uci !== stored[i].uci)) fail(409, 'A partida já foi concluída: os lances não podem mudar, só receber as classificações.');
      let filled = false;
      const merged = stored.map((m, i) => {
        if (m.cls == null && ch.moves[i].cls != null) { filled = true; return { ...m, cls: ch.moves[i].cls }; }
        return m;
      });
      if (filled) out.moves = merged;
    }
    return out;   // pgn, meta e opening_name de partida concluída ficam como estão
  }
  Object.assign(out, ch);
  const mode = ch.mode || g.mode;
  // vale pontuação: só modo normal contra bot; pode deixar de valer a qualquer momento, mas só passa a valer
  // antes do primeiro lance (as mesmas regras do app)
  if (ch.rated !== undefined || ch.mode !== undefined) {
    let rated = ch.rated !== undefined ? !!ch.rated : !!g.rated;
    if (mode !== 'normal' || g.opponent_type !== 'bot') rated = false;
    if (rated && !g.rated && Number(g.ply_count) > 0) rated = false;
    out.rated = rated ? 1 : 0;
  }
  if (ch.moves) out.ply_count = ch.moves.length;
  const status = ch.status || g.status;
  if (status === 'concluida') {
    const reason = ch.result_reason !== undefined ? ch.result_reason : g.result_reason;
    if (!reason) fail(422, 'Informe result_reason para concluir a partida.');
    let result = ch.result !== undefined ? ch.result : g.result;
    // numa partida que vale pontuação, encerrar antes do fim conta como derrota (regra do app)
    const rated = out.rated !== undefined ? !!out.rated : !!g.rated;
    if (!result && reason === 'encerrada' && rated && mode === 'normal' && g.opponent_type === 'bot') {
      const color = g.white_user_id != null ? 'w' : 'b';
      result = color === 'w' ? '0-1' : '1-0';
      out.result = result;
    }
    if (!result && !['encerrada', 'importada'].includes(reason)) fail(422, 'Informe o result da partida concluída.');
    out.finished_at = new Date();
  } else {
    if (ch.result || ch.result_reason) { out.result = null; out.result_reason = null; }
  }
  return out;
}

const COLS = ['moves', 'meta', 'pgn', 'opening_name', 'status', 'result', 'result_reason', 'mode', 'rated', 'ply_count', 'finished_at'];
async function writeGame(db, id, out) {
  const sets = [], params = [];
  for (const k of COLS) {
    if (out[k] === undefined) continue;
    sets.push(`${k} = ?`);
    params.push(k === 'moves' || k === 'meta' ? (out[k] == null ? null : JSON.stringify(out[k])) : out[k]);
  }
  if (sets.length) await db.query(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

// aplica as mudanças numa transação e, se a partida está concluída, atualiza as estatísticas
async function updateIn(db, id, uid, ch) {
  const g = await findGame(id, db, true);
  if (!g || !isOwner(g, uid)) fail(404, 'Partida não encontrada.');
  const out = mergeUpdate(g, ch);
  await writeGame(db, id, out);
  const after = await findGame(id, db, true);
  const queued = after.status === 'concluida' ? await applyConclusion(db, after, parseJson(after.moves)) : false;
  const fresh = await findGame(id, db);
  return { id, queued, game: publicGame(fresh, uid, true), ...(fresh.status === 'concluida' ? await ratingChange(id, uid, db) : { change: null, rating: null }) };
}
// depois do commit: a partida que ficou com a pontuação pendente entra na fila de análise
function afterCommit(out) {
  if (out.queued) ratingQueue.enqueue(out.id);
  return out;
}
const update = async (id, uid, ch) => afterCommit(await transaction(db => updateIn(db, id, uid, ch)));

const reply = (res, status, out) => send(res, status, { ok: true, game: out.game, rating_change: out.change, rating: out.rating });

const PATCH_FIELDS = Object.keys(EDIT);
const POST_FIELDS = [...PATCH_FIELDS, ...Object.keys(CREATE)];

export async function create(req, res) {
  const me = await requireUser(req);
  const body = await readJson(req, MAX_BODY);
  rejectUnknown(body, POST_FIELDS);
  const c = pick(body, CREATE), ch = pick(body, EDIT);
  // POST repetido (o app reenviou depois de uma falha de rede): o mesmo client_ref vira atualização
  if (c.client_ref) {
    const [prev] = await query('SELECT id, white_user_id, black_user_id FROM games WHERE client_ref = ?', [c.client_ref]);
    if (prev) {
      if (!isOwner(prev, me.id)) fail(409, 'client_ref já usado por outra partida.');
      return reply(res, 200, await update(prev.id, me.id, ch));
    }
  }
  const opponent = c.opponent_type || 'bot';
  const color = c.color || 'w';
  const bot = opponent === 'bot' ? c.bot_level : null;
  if (opponent === 'bot' && !bot) fail(422, 'Informe bot_level para uma partida contra bot.');
  const mode = ch.mode || 'assistido';
  const rated = !!ch.rated && opponent === 'bot' && mode === 'normal';
  // quem cria fica num dos lados: a partida nunca nasce sem usuário
  const white = color === 'w' ? me.id : null, black = color === 'b' ? me.id : null;
  const { rated: _r, mode: _m, ...rest } = ch;
  // criação e primeira atualização (que pode já concluir) na mesma transação: se algo for inválido, nada fica gravado
  const out = await transaction(async (db) => {
    let r;
    try {
      r = await db.query(
        'INSERT INTO games (uuid, client_ref, white_user_id, black_user_id, opponent_type, bot_level, mode, status, rated, start_fen, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [toBin(uuidv7()), c.client_ref || null, white, black, opponent, bot, mode, 'em_andamento', rated ? 1 : 0, c.start_fen || null, c.started_at || new Date()]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') fail(409, 'client_ref já usado por outra partida.');
      throw e;
    }
    return updateIn(db, r.insertId, me.id, rest);
  });
  return reply(res, 201, afterCommit(out));
}

export async function patch(req, res, rawId) {
  const me = await requireUser(req);
  if (!isUuid(rawId)) fail(404, 'Partida não encontrada.');
  const body = await readJson(req, MAX_BODY);
  rejectUnknown(body, PATCH_FIELDS);
  const ch = pick(body, EDIT);
  if (!Object.keys(ch).length) fail(422, 'Nada para alterar.');
  const g = await findByUuid(rawId);
  if (!isOwner(g, me.id)) fail(me.role === ROLES.ADMIN ? 403 : 404, me.role === ROLES.ADMIN ? 'Só quem jogou pode alterar a partida.' : 'Partida não encontrada.');
  return reply(res, 200, await update(g.id, me.id, ch));
}

// GET /v1/games/:id/rating — estado da pontuação da partida (o app pergunta até sair do 'pending').
// Quem jogou ou administrador; partida de outra pessoa dá 404, como na leitura.
export async function rating(req, res, rawId) {
  const me = await requireUser(req);
  const g = await findByUuid(rawId);
  const owner = isOwner(g, me.id);
  if (!owner && me.role !== ROLES.ADMIN) fail(404, 'Partida não encontrada.');
  const uid = owner ? me.id : (g.white_user_id || g.black_user_id);
  const out = g.status === 'concluida' ? await ratingChange(g.id, uid) : { change: null, rating: null };
  return send(res, 200, { ok: true, game_id: fromBin(g.uuid), rating_status: ratingStatusOf(g), rating_change: out.change, rating: out.rating });
}

// exclui a partida (só quem jogou). A pontuação e as estatísticas já somadas continuam; o ponto do histórico
// de pontuação fica sem a partida (game_id NULL).
export async function remove(req, res, rawId) {
  const me = await requireUser(req);
  const g = await findByUuid(rawId);
  if (!isOwner(g, me.id)) fail(me.role === ROLES.ADMIN ? 403 : 404, me.role === ROLES.ADMIN ? 'Só quem jogou pode excluir a partida.' : 'Partida não encontrada.');
  await query('DELETE FROM games WHERE id = ?', [g.id]);
  return send(res, 200, { ok: true, deleted: { id: fromBin(g.uuid) } });
}
