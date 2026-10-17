// Ponto de montagem do tutor de IA (Factory + composition root): lê a configuração, cria cada
// provedor com o seu circuit breaker e monta a cadeia na ordem de AI_PROVIDER_ORDER.
// O resto da API usa só `tutorAi` (a cadeia) e não conhece provedores específicos.
import { AI } from '../config.mjs';
import { CircuitBreaker } from './circuit-breaker.mjs';
import { FallbackChain } from './fallback-chain.mjs';
import { DeepSeekProvider, GeminiProvider, OpenRouterProvider } from './providers.mjs';

// registro de provedores: para incluir um novo, crie a subclasse em providers.mjs, a entrada em
// config.mjs (AI.providers) e uma linha aqui
const PROVIDER_CLASSES = {
  gemini: GeminiProvider,
  deepseek: DeepSeekProvider,
  openrouter: OpenRouterProvider,
};

export function createProvider(id, cfg = AI.providers[id], timeoutMs = AI.timeoutMs) {
  const Cls = PROVIDER_CLASSES[id];
  if (!Cls || !cfg) throw new Error(`provedor de IA desconhecido em AI_PROVIDER_ORDER: ${id}`);
  return new Cls({ id, ...cfg, timeoutMs });
}

export function createTutorAi({ order = AI.order, log = () => {} } = {}) {
  const links = order.map(id => ({ provider: createProvider(id), breaker: CircuitBreaker.withDefaults(AI) }));
  return new FallbackChain(links, (ev) => {
    if (ev.type === 'success') log(`ia ${ev.provider} ok ${ev.ms}ms`);
    else if (ev.type === 'failure') log(`ia ${ev.provider} falhou (${ev.kind}${ev.status ? ' ' + ev.status : ''}) ${ev.ms}ms, tentando o próximo`);
    else if (ev.type === 'skip') log(`ia ${ev.provider} pausado (${ev.reason})`);
  });
}

const log = (...a) => console.log(new Date().toISOString(), ...a);
export const tutorAi = createTutorAi({ log });
