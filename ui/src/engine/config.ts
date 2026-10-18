/* Versão do Stockfish usada pelo app: o único lugar que escolhe. O padrão é DEFAULT_ENGINE (adapters/registry.ts);
   o build pode trocar com VITE_STOCKFISH=<id> (ex.: VITE_STOCKFISH=sf10 pnpm build). vite.config.ts valida o id e
   copia para dist/ só os arquivos dessa versão. */
import { createAdapter, resolveEngineId } from './adapters/registry';

export const ENGINE_VERSION: string = resolveEngineId(import.meta.env.VITE_STOCKFISH as string | undefined);
/** dados fixos da versão (arquivos, capacidades, níveis do bot, calibração), sem subir worker */
export const ENGINE_INFO = createAdapter(ENGINE_VERSION);
