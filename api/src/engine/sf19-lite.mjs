// Stockfish 19 lite (pacote npm "stockfish" 19.0.1): rede NNUE pequena, WebAssembly de uma thread. É o mesmo motor
// que a interface usa por padrão (ui/src/engine/adapters/sf19-lite.ts), aqui rodando no Node como processo filho.
// Do pacote só o lite-single é usado (stockfish-19-lite-single.js + .wasm, ~1,9 MB); os builds completos (~99 MB
// cada) ficam no node_modules sem uso.
import { createRequire } from 'node:module';
import { UciEngine } from './base.mjs';

const require = createRequire(import.meta.url);

export class Stockfish19LiteEngine extends UciEngine {
  id = 'sf19-lite';
  label = 'Stockfish 19 (lite)';
  version = '19.0.1';
  script() { return require.resolve('stockfish/bin/stockfish-19-lite-single.js'); }
}
