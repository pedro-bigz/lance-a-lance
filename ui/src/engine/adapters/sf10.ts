/* Stockfish 10 (stockfish.js 10.0.2, asm.js): o motor das versões até a 3.5 do app, mantido no registro para comparar
   e para provar que a troca de versão funciona nos dois sentidos. Arquivos em ui/engines/sf10/. */
import { StockfishAdapter, type BotSearch, type EngineCandidate, type EngineCapabilities } from './base';
import type { BotId } from '../../core/constants';

export class Stockfish10Adapter extends StockfishAdapter {
  readonly id = 'sf10';
  readonly label = 'Stockfish 10 (asm.js)';
  readonly version = '10.0.2';
  readonly candidates: readonly EngineCandidate[] = [{ kind: 'asm', script: 'stockfish.asm.js' }];
  readonly cdn = ['https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/', 'https://unpkg.com/stockfish@10.0.2/src/'];
  // (o Hash do build asm.js vai só até 16; o pedido de 32 fica limitado a 16, como sempre foi)
  readonly capabilities: EngineCapabilities = { multiPvMax: 500, skillLevel: true, limitStrength: null, wdl: false };
  /** os níveis calibrados para o SF10 (Elo aproximado em BOTS) */
  readonly botLevels: Readonly<Record<Exclude<BotId, 'none'>, BotSearch>> = {
    novato: { skill: 0, depth: 1, movetime: 150, random: 0.55 },
    iniciante: { skill: 0, depth: 2, movetime: 250, random: 0.22 },
    intermediario: { skill: 4, depth: 5, movetime: 500, random: 0.06 },
    avancado: { skill: 9, depth: 8, movetime: 800, random: 0 },
    mestre: { skill: 16, depth: 13, movetime: 1400, random: 0 },
    gm: { skill: 20, depth: 18, movetime: 2000, random: 0 },
  };
  /** o SF10 tem Contempt (padrão 24): 0 deixa a nota neutra para a classificação */
  override initCommands(): string[] {
    return [...super.initCommands(), 'setoption name Contempt value 0'];
  }
}
