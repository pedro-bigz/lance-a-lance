/* ---------- Rating do jogador (Elo; no artifact salvo neste navegador, no desktop na API) ----------
   No app desktop a pontuação vem da API (player_stats): ao concluir uma partida que vale pontos a API responde
   "pendente", roda o Stockfish no servidor e a página pergunta até o resultado sair (followServerRating em
   store/session.ts); enquanto isso o topo mostra "Calculando a pontuação…". No artifact o rating continua neste
   navegador (localStorage) e usa a mesma fórmula com a análise da própria página. Regras em core/rating.ts.
   O número do topo (RATING_UI.shown) é desenhado pelo TopBar; a animação de +/− é imperativa sobre a pílula. */
import { S, botColor } from '../core/state';
import { resultOf } from '../core/result';
import { applyResult, freshRating, localDelta, parseRating, playerAccuracy, ratingScore, type RatingRecord } from '../core/rating';
import { reducedMotion } from '../board/animations';
import { API_GAMES, DESKTOP_STATS } from '../desktop/bridge';
import { RATING_KEY } from '../store/local';
import { publish } from '../store/view-store';
import { fmtDelta } from '../ui/format';

function readRating(): RatingRecord {
  try {
    return parseRating(localStorage.getItem(RATING_KEY));
  } catch (_) {
    return freshRating();
  }
}
export function writeRating(r: RatingRecord): void {
  try {
    localStorage.setItem(RATING_KEY, JSON.stringify(r));
  } catch (_) {}
}
export const RATING: RatingRecord = API_GAMES ? freshRating() : readRating();
/** valor exibido no topo (anima até o rating novo); pending = partida cuja pontuação está sendo calculada */
export const RATING_UI: { shown: number; pending: string | null } = { shown: RATING.rating, pending: null };

/** o que a tela mostra da pontuação de uma partida (before/after null quando só se sabe o delta, ex. histórico da API) */
export interface RatingView {
  delta: number;
  before: number | null;
  after: number | null;
  accuracy: number | null;
}
/** desktop: pontuações conhecidas pela API nesta sessão (resposta da gravação, rota de status, partida aberta) */
const SERVER = new Map<string, RatingView>();
export function rememberServerRating(id: string, v: RatingView): void {
  const old = SERVER.get(id);
  // não troca um registro completo (com antes/depois) por um só com o delta
  if (old && old.before != null && v.before == null) return;
  SERVER.set(id, v);
}
export function ratingInfo(id: string | null): RatingView | null {
  if (!id) return null;
  const a = RATING.applied[id];
  if (a) return { delta: a.delta, before: a.before, after: a.after, accuracy: a.accuracy ?? null };
  return SERVER.get(id) || null;
}
export function setRatingPending(id: string | null): void {
  if (RATING_UI.pending === id) return;
  RATING_UI.pending = id;
  renderRating();
}

/* ---------- artifact: rating local ----------
   No fim da partida a precisão depende da análise do Stockfish da página, que termina depois do último lance:
   enquanto faltar a classificação de algum lance do jogador, a pontuação fica "calculando" e é aplicada quando a
   análise chega (analysis.ts chama applyRatingIfDone de novo). Se o motor não carregou ou a análise não termina em
   LOCAL_WAIT_MS, usa os lances já analisados (sem nenhum, a precisão neutra NEUTRAL_ACCURACY). */
export const LOCAL_WAIT_MS = 20000;
const NEUTRAL_ACCURACY = 70;
let localWait: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function applyRatingIfDone(force = false): void {
  if (API_GAMES) return; // no desktop quem calcula é a API (resposta da gravação, em onGameSaved)
  if (!S.rated || S.mode !== 'play' || !S.over || !S.gameId || !botColor()) return;
  if (RATING.applied[S.gameId] != null) return;
  const o = resultOf(S.game, { player: S.player, hasBot: true, resigned: S.resigned, ended: S.ended, botName: S.bot.name });
  const score = ratingScore(o.result);
  if (score == null) return;
  const colors = S.plies.map((p) => p.color);
  let pa = playerAccuracy(S.cls, colors, S.player);
  if (!pa && !force && !S.engineErr) {
    // espera a análise terminar (com um prazo)
    if (!localWait || localWait.id !== S.gameId) {
      if (localWait) clearTimeout(localWait.timer);
      const id = S.gameId;
      localWait = { id, timer: setTimeout(() => S.gameId === id && applyRatingIfDone(true), LOCAL_WAIT_MS) };
    }
    setRatingPending(S.gameId);
    return;
  }
  if (!pa) {
    const part = playerAccuracy(S.cls, colors, S.player, true)!;
    pa = { accuracy: part.accuracy ?? NEUTRAL_ACCURACY, moves: part.moves };
  }
  if (localWait) clearTimeout(localWait.timer);
  localWait = null;
  const before = RATING.rating;
  const out = localDelta(before, { score, bot: S.bot.id, accuracy: pa.accuracy, playerMoves: pa.moves, early: S.resigned || S.ended });
  applyResult(RATING, S.gameId, out);
  writeRating(RATING);
  RATING_UI.pending = null;
  // espera a animação de fim de jogo antes de mexer no número do topo
  setTimeout(() => animateRating(before, RATING.rating), S.game.in_checkmate() ? 1700 : 400);
}

export function animateRating(from: number, to: number): void {
  const pill = document.getElementById('ratingPill'),
    delta = to - from;
  if (!delta || reducedMotion() || !pill) {
    RATING_UI.shown = to;
    renderRating();
    return;
  }
  const f = document.createElement('span');
  f.className = 'rating-float ' + (delta > 0 ? 'up' : 'down');
  f.textContent = fmtDelta(delta);
  pill.appendChild(f);
  f.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 6px) scale(.8)' },
      { opacity: 1, transform: 'translate(-50%, -14px) scale(1.15)', offset: 0.25 },
      { opacity: 1, transform: 'translate(-50%, -20px) scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'translate(-50%, -34px) scale(.9)' },
    ],
    { duration: 1800, easing: 'ease-out' },
  ).finished.then(() => f.remove());
  pill.classList.add(delta > 0 ? 'flash-up' : 'flash-down');
  // contagem com setTimeout (requestAnimationFrame pausa em janela oculta e o número ficaria parado)
  const t0 = performance.now() + 450,
    dur = 700;
  const step = () => {
    const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur));
    RATING_UI.shown = Math.round(from + delta * (1 - Math.pow(1 - k, 3)));
    renderRating();
    if (k < 1) setTimeout(step, 30);
    else {
      RATING_UI.shown = to;
      pill.classList.remove('flash-up', 'flash-down');
      renderRating();
    }
  };
  setTimeout(step, 30);
}
/** o número do topo e o dos jogadores mudaram */
export function renderRating(): void {
  publish('board');
}
/** a nota da nova partida (rating e bot recomendado) é desenhada pelo TopBar a partir de RATING e S.gameMode */
export function renderRecNote(): void {
  publish('board');
}
// pontuação do jogador vinda de player_stats (desktop)
export async function loadServerRating(): Promise<void> {
  const r = await DESKTOP_STATS!.me().catch(() => null);
  if (!r || !r.ok) return;
  if (!RATING_UI.pending) RATING.rating = RATING_UI.shown = r.stats.rating;
  RATING.games = r.stats.games_played;
  RATING.wins = r.stats.wins;
  RATING.losses = r.stats.losses;
  RATING.draws = r.stats.draws;
  renderRating();
}
