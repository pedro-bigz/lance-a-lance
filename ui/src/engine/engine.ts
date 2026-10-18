/* ---------- Motor (Stockfish em Web Worker) ----------
   O app fala só com o contrato StockfishAdapter (adapters/base.ts); a versão vem de config.ts (padrão: Stockfish 19
   lite). Os arquivos da versão ficam ao lado da página (engines/<id>/ → dist). No app desktop o worker sobe do mesmo
   origin (app://lance, que serve o .wasm como application/wasm); no artifact, se as cópias locais falharem, tenta a
   CDN por um Blob com importScripts. */
import { statusView } from '../store/view-store';
import type { StockfishAdapter } from './adapters/base';
import { createAdapter } from './adapters/registry';
import { ENGINE_VERSION } from './config';

export type { AnalyseOpts, StockfishAdapter } from './adapters/base';

/** motor da análise da partida (classificações, dica) */
export const engine: StockfishAdapter = createAdapter(ENGINE_VERSION);
/** motor do bot, das demonstrações e do estudo (deixa o da análise livre) */
export const botEngine: StockfishAdapter = createAdapter(ENGINE_VERSION);
/** o texto do estado do Stockfish (engineStatusText em game/panels.tsx) mudou: fila de análise ou motor pronto */
export const setStatus = (): void => statusView.publish();
