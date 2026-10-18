// Pontuação pelo Stockfish no servidor: monta a fila (queue.mjs) com o banco (store.mjs) e o motor (src/engine/).
// O motor sobe na primeira análise e é encerrado depois de ENGINE_IDLE_MS sem trabalho (~140 MB a menos parado);
// se o processo cair no meio de uma análise, a próxima sobe um novo.
import { ANALYSIS, createEngine, engineVersion, ENGINE_ID, ENGINES } from '../engine/registry.mjs';
import { playerAccuracy } from './analyse-game.mjs';
import { RatingQueue } from './queue.mjs';
import { createSqlStore } from './store.mjs';

const log = (...a) => console.log(new Date().toISOString(), ...a);
export const ENGINE_IDLE_MS = 60000;
export const MAX_ATTEMPTS = 3;

let engine = null, idleTimer = null;
async function getEngine() {
  clearTimeout(idleTimer);
  if (engine && engine.proc) return engine;
  engine = createEngine();
  try { await engine.start(); } catch (e) { const e0 = engine; engine = null; await e0.stop().catch(() => {}); throw e; }
  return engine;
}
async function stopEngine() {
  clearTimeout(idleTimer);
  const e = engine;
  engine = null;
  if (e) await e.stop().catch(() => {});
}

async function analyse(game) {
  const e = await getEngine();
  try {
    return await playerAccuracy(e, { startFen: game.start_fen, moves: game.moves, color: game.color }, { depth: ANALYSIS.depth });
  } catch (err) {
    await stopEngine();   // motor num estado desconhecido: o próximo sobe do zero
    throw err;
  }
}

const proto = new ENGINES[ENGINE_ID]();
export const ENGINE_VERSION = engineVersion(proto);

export const ratingQueue = new RatingQueue({
  store: createSqlStore({ engineVersion: ENGINE_VERSION }),
  analyse,
  maxAttempts: MAX_ATTEMPTS,
  log,
  onIdle: () => { clearTimeout(idleTimer); idleTimer = setTimeout(stopEngine, ENGINE_IDLE_MS); idleTimer.unref(); },
});

/** encerramento da API: para a fila e o motor */
export async function shutdownRating() {
  await ratingQueue.stop();
  await stopEngine();
}
