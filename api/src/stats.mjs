// Estatísticas do jogador (player_stats) e evolução da pontuação (rating_history), sempre do usuário logado;
// administrador pode ver as de outro usuário com ?user_id=<uuid>. Para fora sai só o uuid (user_id, game_id).
import { fail, send } from './http.mjs';
import { query, transaction } from './db.mjs';
import { RATING_START, ensureStats, targetUser } from './games.mjs';
import { CLS_COLUMNS } from './move-classes.mjs';
import { fromBinOrNull } from './uuid.mjs';

const iso = (d) => d instanceof Date ? d.toISOString() : d;
const avg = (n, d) => d ? Math.round(n / d * 100) / 100 : 0;

// uid: id interno; uuid: o id público do mesmo usuário (vai em user_id)
export async function statsOf(uid, uuid) {
  await transaction(db => ensureStats(db, uid));
  const [s] = await query('SELECT * FROM player_stats WHERE user_id = ?', [uid]);
  const per = Number(s.games_classified);
  // stats.moves: uma chave por coluna de classificação de player_stats (book_moves, ..., blunders)
  const moves = {};
  for (const col of Object.values(CLS_COLUMNS)) moves[col] = { total: Number(s[col]), avg: avg(Number(s[col]), per) };
  return {
    user_id: uuid, rating: Number(s.rating),
    games_played: Number(s.games_played), wins: Number(s.wins), losses: Number(s.losses), draws: Number(s.draws),
    games_classified: per, total_moves: Number(s.total_moves), avg_moves: avg(Number(s.total_moves), per),
    moves, updated_at: iso(s.updated_at),
  };
}

export async function me(req, res, url) {
  const { uid, uuid } = await targetUser(req, url);
  return send(res, 200, { ok: true, stats: await statsOf(uid, uuid) });
}

function dateParam(v, label, endOfDay = false) {
  if (v == null || v === '') return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(v);
  if (!Number.isFinite(d.getTime())) fail(400, `Data inválida em ${label}.`);
  return d;
}

// início do grupo (dia, semana começando na segunda ou mês) no fuso do app (tz = minutos a somar ao UTC)
function bucketStart(date, group, tz) {
  const d = new Date(date.getTime() + tz * 60000);
  d.setUTCHours(0, 0, 0, 0);
  if (group === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (group === 'month') d.setUTCDate(1);
  return new Date(d.getTime() - tz * 60000);
}

// pontos para o gráfico: cada mudança de pontuação (group ausente) ou o último valor de cada dia/semana/mês.
// start_rating é a pontuação no começo do período (último ponto antes de "from"), para a linha começar na borda.
export async function ratingHistory(req, res, url) {
  const { uid } = await targetUser(req, url);
  const p = url.searchParams;
  const from = dateParam(p.get('from'), 'from'), to = dateParam(p.get('to'), 'to', true);
  const group = p.get('group') || 'none';
  if (!['none', 'day', 'week', 'month'].includes(group)) fail(400, 'group deve ser day, week ou month.');
  const tzRaw = p.get('tz');
  if (tzRaw != null && !/^-?\d{1,3}$/.test(tzRaw)) fail(400, 'tz deve ser um número de minutos.');
  const tz = Math.max(-840, Math.min(840, Number(tzRaw || 0)));
  await transaction(db => ensureStats(db, uid));

  const where = ['h.user_id = ?'], params = [uid];
  if (from) { where.push('h.created_at >= ?'); params.push(from); }
  if (to) { where.push('h.created_at <= ?'); params.push(to); }
  // a partida sai pelo uuid (game_uuid); o id do ponto e o game_id interno ficam aqui
  const rows = await query(`SELECT g.uuid AS game_uuid, h.rating_before, h.rating_after, h.delta, h.reason, h.created_at FROM rating_history h LEFT JOIN games g ON g.id = h.game_id WHERE ${where.join(' AND ')} ORDER BY h.created_at, h.id LIMIT 5000`, params);
  let start = null;
  if (from) {
    const [prev] = await query('SELECT rating_after FROM rating_history WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1', [uid, from]);
    start = prev ? Number(prev.rating_after) : null;
  }
  if (start == null) start = rows.length ? Number(rows[0].rating_before) : RATING_START;
  const [cur] = await query('SELECT rating FROM player_stats WHERE user_id = ?', [uid]);

  let points;
  if (group === 'none') {
    points = rows.map(r => ({ at: iso(r.created_at), rating: Number(r.rating_after), delta: Number(r.delta), games: r.reason === 'inicial' ? 0 : 1, reason: r.reason, game_id: fromBinOrNull(r.game_uuid) }));
  } else {
    const map = new Map();
    for (const r of rows) {
      const k = bucketStart(new Date(r.created_at), group, tz).toISOString();
      const b = map.get(k) || { at: k, rating: 0, delta: 0, games: 0, min: Infinity, max: -Infinity };
      b.rating = Number(r.rating_after); b.delta += Number(r.delta); b.games += r.reason === 'inicial' ? 0 : 1;
      b.min = Math.min(b.min, Number(r.rating_after)); b.max = Math.max(b.max, Number(r.rating_after));
      map.set(k, b);
    }
    points = [...map.values()];
  }
  return send(res, 200, { ok: true, points, start_rating: start, current_rating: cur ? Number(cur.rating) : RATING_START, from: iso(from), to: iso(to), group });
}
