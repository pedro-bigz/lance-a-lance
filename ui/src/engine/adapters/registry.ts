/* Registro das versões do Stockfish: id → adaptador. Para instalar uma versão nova, crie a subclasse, registre aqui
   e (se for a nova padrão) troque DEFAULT_ENGINE. A versão do build vem de VITE_STOCKFISH (veja ../config.ts e
   vite.config.ts); id desconhecido é erro no build, com a lista das versões registradas. */
import type { StockfishAdapter } from './base';
import { Stockfish10Adapter } from './sf10';
import { Stockfish19LiteAdapter } from './sf19-lite';

export const ENGINE_ADAPTERS: Readonly<Record<string, () => StockfishAdapter>> = {
  sf10: () => new Stockfish10Adapter(),
  'sf19-lite': () => new Stockfish19LiteAdapter(),
};
export const DEFAULT_ENGINE = 'sf19-lite';

/** id → adaptador novo (cada instância tem o próprio worker); erro claro se o id não estiver registrado */
export function createAdapter(id: string = DEFAULT_ENGINE): StockfishAdapter {
  const make = ENGINE_ADAPTERS[id];
  if (!make) throw new Error(`Versão do Stockfish desconhecida: "${id}". Registradas: ${Object.keys(ENGINE_ADAPTERS).join(', ')}.`);
  return make();
}
/** id escolhido (VITE_STOCKFISH vazio ou ausente = padrão) */
export function resolveEngineId(v: string | undefined | null): string {
  const id = (v || '').trim() || DEFAULT_ENGINE;
  createAdapter(id); // valida
  return id;
}
