/* Stockfish 19 lite (stockfish.js 19.0.1, npm "stockfish"): rede NNUE pequena, WebAssembly de uma thread (não exige
   cross-origin isolation), com o mesmo motor em asm.js de reserva para quando o WebAssembly não carrega.
   Arquivos em ui/engines/sf19-lite/ com os nomes do pacote. O .js do lite acha o .wasm pelo hash da URL do worker
   (base.ts manda o endereço sempre) ou, sem hash, trocando o .js do próprio endereço por .wasm. */
import { StockfishAdapter, type BotSearch, type EngineCandidate, type EngineCapabilities } from './base';
import type { BotId } from '../../core/constants';

export class Stockfish19LiteAdapter extends StockfishAdapter {
  readonly id = 'sf19-lite';
  readonly label = 'Stockfish 19 (lite)';
  readonly version = '19.0.1';
  readonly candidates: readonly EngineCandidate[] = [
    { kind: 'wasm', script: 'stockfish-19-lite-single.js', wasm: 'stockfish-19-lite-single.wasm' },
    { kind: 'asm', script: 'stockfish-19-asm.js' },
  ];
  /** O jsDelivr recusa o pacote 19.0.1 (403: passa do limite de 150 MB por causa dos builds completos de ~94 MB);
      o unpkg serve os mesmos arquivos, o .wasm como application/wasm e com CORS. */
  readonly cdn = ['https://unpkg.com/stockfish@19.0.1/bin/'];
  // (sem Contempt desde o Stockfish 14; Threads fica em 1 no build single)
  readonly capabilities: EngineCapabilities = { multiPvMax: 256, skillLevel: true, limitStrength: { min: 1320, max: 3190 }, wdl: true };
  /** Novato, Iniciante e Intermediário ficaram como no SF10 (a perda média por lance é a mesma: o que pesa é o lance
      aleatório e a profundidade mínima). Avançado e Mestre ficaram bem mais fortes com Skill Level; passam a usar
      UCI_Elo com o Elo do nível, que deixa a perda média perto da que tinham no SF10. O Grão-mestre segue no máximo. */
  readonly botLevels: Readonly<Record<Exclude<BotId, 'none'>, BotSearch>> = {
    novato: { skill: 0, depth: 1, movetime: 150, random: 0.55 },
    iniciante: { skill: 0, depth: 2, movetime: 250, random: 0.22 },
    intermediario: { skill: 4, depth: 5, movetime: 500, random: 0.06 },
    avancado: { skill: 20, depth: 8, movetime: 800, random: 0, elo: 1600 },
    mestre: { skill: 20, depth: 13, movetime: 1400, random: 0, elo: 2200 },
    gm: { skill: 20, depth: 18, movetime: 2000, random: 0 },
  };
}
