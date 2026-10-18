/* ---------- Rating do jogador (Elo; no artifact salvo neste navegador, no desktop na API) ----------
   No app desktop a pontuação vem da API (player_stats) e é calculada pelo servidor quando a partida termina;
   aqui fica só o valor exibido. No artifact continua neste navegador (localStorage). Regras em core/rating.ts.
   O número do topo (RATING_UI.shown) é desenhado pelo TopBar; a animação de +/− é imperativa sobre a pílula. */
import { S, botColor } from '../core/state';
import { resultOf } from '../core/result';
import { applyScore, freshRating, parseRating, ratingScore, type RatingApplied, type RatingRecord } from '../core/rating';
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
/** valor exibido no topo (anima até o rating novo) */
export const RATING_UI = { shown: RATING.rating };

export function applyRatingIfDone(): void {
  if (API_GAMES) return; // no desktop quem calcula é a API (resposta da gravação, em onGameSaved)
  if (!S.rated || S.mode !== 'play' || !S.over || !S.gameId || !botColor()) return;
  if (RATING.applied[S.gameId] != null) return;
  const o = resultOf(S.game, { player: S.player, hasBot: true, resigned: S.resigned, ended: S.ended, botName: S.bot.name });
  const score = ratingScore(o.result);
  if (score == null) return;
  const before = RATING.rating;
  applyScore(RATING, S.gameId, score);
  writeRating(RATING);
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
export function ratingInfo(id: string | null): RatingApplied | null {
  return id && RATING.applied[id] ? RATING.applied[id] : null;
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
  RATING.rating = RATING_UI.shown = r.stats.rating;
  RATING.games = r.stats.games_played;
  RATING.wins = r.stats.wins;
  RATING.losses = r.stats.losses;
  RATING.draws = r.stats.draws;
  renderRating();
}
