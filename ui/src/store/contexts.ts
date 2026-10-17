/* Contextos do tabuleiro (só no app desktop, com a sidebar): o Tabuleiro e o Aberturas têm partidas separadas.
   Tabuleiro: a partida de sempre, em STORE (a sessão lembrada por usuário). Aberturas: a partida do estudo em
   studyStoreKey(), com a prática (variantes, placar, estado). Trocar de contexto grava a partida que sai (estado local
   e GameStore), cancela bot, replay, demonstração, dicas e avaliações pendentes, e carrega a outra. O Aberturas só
   retoma um estudo em andamento; estudo concluído (resumo final, "Continuar…" ou "Encerrar estudo") não é guardado,
   então a próxima entrada começa num tabuleiro novo. No artifact não há contextos: o painel age na partida aberta. */
import { BOTS } from '../core/constants';
import { resetBoard } from '../core/game';
import { S, type Trainer } from '../core/state';
import { requestAnalysis } from '../engine/analysis';
import { maybeBot } from '../engine/bot';
import { ACCOUNT } from '../desktop/account';
import { DESKTOP_AUTH } from '../desktop/bridge';
import { renderAll } from '../game/panel';
import { stopReplay } from '../game/replay';
import { setStudy } from '../study/panel';
import { STUDY, devOf, studyDevEvals, studyFromSnapshot, studySync, type Practice } from '../study/practice';
import { abortTutor } from '../tutor/tutor';
import { $ } from '../ui/dom';
import { GameStore } from './game-store';
import { isObj, isStr, lsGet, newId } from './local';
import { restore, save, saveGame, studyStoreKey, STORE, type BoardSnapshot } from './session';

export type BoardCtx = 'jogo' | 'estudo';
// contexto do tabuleiro no app desktop: 'jogo' (Tabuleiro) ou 'estudo' (Aberturas), cada um com a sua partida
let BOARD_CTX: BoardCtx = 'jogo';
export const boardCtx = (): BoardCtx => BOARD_CTX;
interface CtxMem {
  gameId: string | null;
  trainer: Trainer | null | undefined;
  practice: Practice | null;
}
const CTX_MEM: Partial<Record<BoardCtx, CtxMem>> = {}; // por contexto, o que não vai para o localStorage nesta sessão

export function freshStudyBoard(): void {
  S.mode = 'play';
  S.headers = {};
  S.trainer = null;
  STUDY.practice = null;
  S.demoQueue = [];
  S.bot = BOTS.find((b) => b.id === 'none')!;
  S.player = 'w';
  resetBoard();
  S.orient = 'w';
  S.gameId = newId();
  S.createdAt = Date.now();
  S.fromHistory = false;
  S.recResult = S.recText = null;
  S.rated = false;
  requestAnalysis(S.positions[0] as string);
  $<HTMLDetailsElement>('#studyPickBox').open = true;
  $<HTMLDetailsElement>('#studyExpBox').open = true;
  STUDY.autoClosed = false;
  try {
    localStorage.removeItem(studyStoreKey());
  } catch (_) {}
}
function loadJogoCtx(): void {
  const ok = restore(STORE);
  if (!ok) {
    S.mode = 'play';
    S.headers = {};
    resetBoard();
    S.orient = S.player;
    S.gameId = newId();
    S.createdAt = null;
    S.fromHistory = false;
    S.recResult = S.recText = null;
    S.rated = false;
    requestAnalysis(S.positions[0] as string);
  }
  const m = CTX_MEM.jogo;
  S.trainer = m && m.gameId === S.gameId ? m.trainer : null; // treino do tutor que estava no Tabuleiro
  STUDY.practice = m && m.gameId === S.gameId ? m.practice : null;
}
// slot do estudo no localStorage: posição inicial, lances em UCI e o estado do estudo (objeto) para reconstruir a prática
const isSnapshot = (v: unknown): v is BoardSnapshot =>
  isObj(v) &&
  isStr(v.start) &&
  Array.isArray(v.moves) &&
  v.moves.every(isStr) &&
  (v.gameId == null || isStr(v.gameId)) &&
  (v.study == null || isObj(v.study));
function loadStudyCtx(): void {
  const key = studyStoreKey(),
    d = lsGet<BoardSnapshot | null>(key, null, isSnapshot),
    m = CTX_MEM.estudo;
  const rebuilt = d && d.study && d.gameId ? (m && m.gameId === d.gameId && m.practice ? m : studyFromSnapshot(d.study)) : null;
  if (!rebuilt || !rebuilt.practice || !restore(key)) {
    freshStudyBoard();
    return;
  }
  S.trainer = rebuilt.trainer;
  STUDY.practice = rebuilt.practice;
  S.rated = false;
  STUDY.sel = rebuilt.practice.sel;
  $<HTMLDetailsElement>('#studyPickBox').open = false;
  $<HTMLDetailsElement>('#studyExpBox').open = false;
  STUDY.autoClosed = true;
  studySync();
  const p = STUDY.practice;
  if (p.state === 'dev') {
    p.dev = devOf(p);
    studyDevEvals(p.dev);
  }
}
export function switchBoardCtx(ctx: BoardCtx): void {
  if (!DESKTOP_AUTH || !ACCOUNT.user || !GameStore || ctx === BOARD_CTX) return;
  // sai do contexto atual: grava a partida e corta tudo o que ainda podia mexer nela
  stopReplay();
  S.demoQueue = [];
  S.botToken++;
  S.botThinking = false;
  S.studyMark = null;
  S.hintAt = -1;
  S.selected = null;
  S.targets = [];
  $('#promo').hidden = true;
  STUDY.expTok++;
  STUDY.expKey = STUDY.pracKey = null;
  abortTutor(); // o tutor não continua agindo na partida do outro contexto
  CTX_MEM[BOARD_CTX] = { gameId: S.gameId, trainer: S.trainer, practice: STUDY.practice };
  save();
  saveGame();
  GameStore.flush();
  BOARD_CTX = ctx;
  if (ctx === 'estudo') loadStudyCtx();
  else {
    loadJogoCtx();
    setStudy(false);
  }
  save();
  renderAll();
  maybeBot();
}
