/* ---------- Início da área do jogo ----------
   No artifact começa direto; no app desktop só depois do login (o Stockfish e o bot não sobem antes). */
import { resetBoard } from './core/game';
import { S } from './core/state';
import { BOARD_STYLES, CAPTURE_STYLES, PIECE_STYLES, STYLE, preloadPieces } from './board/pieces';
import { applyStyle } from './board/style-picker';
import { requestAnalysis } from './engine/analysis';
import { maybeBot } from './engine/bot';
import { botEngine, engine } from './engine/engine';
import { ACCOUNT } from './desktop/account';
import { API_GAMES, LD } from './desktop/bridge';
import { renderBots } from './game/controls';
import { openHistory, renderHistCount } from './game/history';
import { loadMocks } from './game/mocks';
import { renderAll } from './game/panel';
import { loadServerRating } from './game/rating';
import { GameStore, apiGameStore, localGameStore, setGameStore } from './store/game-store';
import { newId } from './store/local';
import { migrateLegacyKeys, onGameSaved, restore, resumeFromApi, setStoreKey } from './store/session';
import { prefs } from './ui/theme';
import { $ } from './ui/dom';

let appBooted = false;
export function bootApp(): void {
  if (appBooted) return;
  appBooted = true;
  engine.start();
  botEngine.start();
  // partidas: API no desktop (por usuário), localStorage no artifact. Partidas locais de versões antigas do
  // desktop ficam onde estão e são ignoradas.
  const user = ACCOUNT.user;
  if (API_GAMES && user) {
    migrateLegacyKeys(ACCOUNT.legacyId, user.id);
    setStoreKey(`lance-a-lance:v1:u${user.id}`);
  }
  setGameStore(API_GAMES && user ? apiGameStore(LD!.games!, user.id) : localGameStore());
  const store = GameStore!;
  store.onSaved(onGameSaved);
  $('#mockBtns').hidden = store.kind === 'api';
  renderBots();
  if (BOARD_STYLES.some((b) => b.id === prefs.board)) STYLE.board = prefs.board as string;
  if (PIECE_STYLES.some((p) => p.id === prefs.pieces)) STYLE.pieces = prefs.pieces as string;
  if (CAPTURE_STYLES.some((c) => c.id === prefs.capture)) STYLE.capture = prefs.capture as string;
  applyStyle();
  preloadPieces(STYLE.pieces);
  renderHistCount();
  const restored = restore();
  if (!restored) {
    S.orient = S.player;
    resetBoard();
    requestAnalysis(S.positions[0] as string);
  }
  if (!S.gameId && S.mode === 'play') S.gameId = newId();
  renderAll();
  maybeBot();
  if (store.kind === 'api') {
    loadServerRating();
    if (!restored) resumeFromApi();
  }
  if (location.hash === '#exemplos') {
    loadMocks();
    openHistory();
  }
}
