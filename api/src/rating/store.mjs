// Banco da fila de pontuação: ler a partida para analisar, listar as pendentes e aplicar o resultado.
// apply() roda numa transação que trava a partida (FOR UPDATE) e a linha de player_stats do jogador: se a partida
// não está mais pendente (outra execução já aplicou), não faz nada — o delta nunca é aplicado duas vezes.
import { query, transaction } from '../db.mjs';
import { ensureStats } from '../games.mjs';
import { computeRating, playerColor } from './compute.mjs';

const parseJson = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (_) { return null; } };
const COLS = 'id, start_fen, moves, white_user_id, black_user_id, bot_level, result, result_reason, rating_status, rating_attempts';

export function createSqlStore({ engineVersion }) {
  return {
    async load(id) {
      const [g] = await query(`SELECT ${COLS} FROM games WHERE id = ?`, [id]);
      if (!g) return null;
      const moves = (parseJson(g.moves) || []).map((m) => m.uci);
      return { ...g, moves, color: playerColor(g) };
    },
    async pendingIds(maxAttempts) {
      const rows = await query("SELECT id FROM games WHERE rating_status = 'pending' OR (rating_status = 'failed' AND rating_attempts < ?) ORDER BY finished_at, id LIMIT 1000", [maxAttempts]);
      return rows.map((r) => r.id);
    },
    apply(id, analysis) {
      return transaction(async (db) => {
        const [g] = await db.query(`SELECT ${COLS} FROM games WHERE id = ? FOR UPDATE`, [id]);
        if (!g || (g.rating_status !== 'pending' && g.rating_status !== 'failed')) return { applied: false };
        const uid = g.white_user_id ?? g.black_user_id;
        await ensureStats(db, uid);
        const [s] = await db.query('SELECT rating FROM player_stats WHERE user_id = ? FOR UPDATE', [uid]);
        const r = computeRating(g, analysis, Number(s.rating));
        const acc = Math.round(r.accuracy * 100) / 100, exp = Math.round(r.expected * 10000) / 10000;
        await db.query('UPDATE player_stats SET rating = ? WHERE user_id = ?', [r.after, uid]);
        await db.query('INSERT INTO rating_history (user_id, game_id, rating_before, rating_after, delta, reason, player_accuracy, bot_elo, expected_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [uid, id, r.before, r.after, r.delta, r.reason, acc, r.botElo, exp]);
        await db.query("UPDATE games SET rating_status = 'applied', rating_delta = ?, player_accuracy = ?, bot_elo = ?, expected_score = ?, engine_version = ?, rating_applied_at = ? WHERE id = ?",
          [r.delta, acc, r.botElo, exp, engineVersion, new Date(), id]);
        return { applied: true, ...r };
      });
    },
    /** marca a falha; attempts = valor final (permanente: já no máximo). Devolve as tentativas gravadas. */
    async markFailed(id, attempts = null) {
      await query(`UPDATE games SET rating_status = 'failed', rating_attempts = ${attempts == null ? 'LEAST(rating_attempts + 1, 255)' : '?'} WHERE id = ? AND rating_status IN ('pending', 'failed')`,
        attempts == null ? [id] : [attempts, id]);
      const [g] = await query('SELECT rating_attempts FROM games WHERE id = ?', [id]);
      return g ? Number(g.rating_attempts) : attempts ?? 0;
    },
  };
}
