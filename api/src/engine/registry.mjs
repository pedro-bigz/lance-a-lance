// Registro das versões do motor no servidor: id → classe. ENGINE_ID é o único lugar que escolhe a versão usada na
// análise da pontuação (e a que fica gravada em games.engine_version). Para outra versão: crie a subclasse de
// UciEngine, registre aqui e troque ENGINE_ID.
import { Stockfish19LiteEngine } from './sf19-lite.mjs';

export const ENGINES = Object.freeze({ 'sf19-lite': Stockfish19LiteEngine });
export const ENGINE_ID = 'sf19-lite';

/** busca fixa por posição (determinística: nunca por tempo). Medida e justificada em api/README.md ("Pontuação"). */
export const ANALYSIS = Object.freeze({ depth: 14, hashMb: 16 });

export function createEngine(id = ENGINE_ID, opts = {}) {
  const C = ENGINES[id];
  if (!C) throw new Error(`Versão do motor desconhecida: "${id}". Registradas: ${Object.keys(ENGINES).join(', ')}.`);
  return new C({ hashMb: ANALYSIS.hashMb, ...opts });
}
/** "sf19-lite@19.0.1" (games.engine_version) */
export const engineVersion = (e) => `${e.id}@${e.version}`;
