// Padrão Chain of Responsibility: os provedores são tentados em ordem de prioridade; quando um falha
// (erro, sem crédito, fora do ar), o pedido passa para o próximo. Cada elo tem um CircuitBreaker
// que pula, por um tempo, quem acabou de falhar.
//
// A cadeia não sabe nada de HTTP nem de provedores específicos: recebe uma lista de
// {provider, breaker} e devolve a primeira resposta boa, com o id de quem respondeu.
import { AllProvidersFailedError, FAILURE, ProviderError, RequestCancelledError } from './errors.mjs';

export class FallbackChain {
  /**
   * @param {{provider: import('./chat-provider.mjs').ChatProvider, breaker: import('./circuit-breaker.mjs').CircuitBreaker}[]} links
   * @param {(event: object) => void} [onEvent]  observador para log (sucesso, falha, pulo)
   */
  constructor(links, onEvent = () => {}) {
    if (!links.length) throw new Error('a cadeia de IA precisa de pelo menos um provedor');
    this.links = links;
    this.onEvent = onEvent;
  }

  /** @returns {Promise<{provider: string, message: object, finish: string, usage: object}>} */
  async complete(request, signal) {
    const attempts = [];
    for (const link of this.orderForRequest()) {
      const { provider, breaker } = link;
      if (signal?.aborted) throw new RequestCancelledError();
      if (!provider.configured) { attempts.push(attempt(provider, FAILURE.NOT_CONFIGURED)); continue; }
      const t0 = Date.now();
      try {
        const result = await provider.complete(request, signal);
        breaker.recordSuccess();
        this.onEvent({ type: 'success', provider: provider.id, ms: Date.now() - t0 });
        return { provider: provider.id, providerName: provider.name, ...result };
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;   // cancelamento do cliente ou bug: não troca de provedor
        breaker.recordFailure(e.kind);
        attempts.push(attempt(provider, e.kind, e.detail));
        this.onEvent({ type: 'failure', provider: provider.id, kind: e.kind, status: e.status, ms: Date.now() - t0 });
      }
    }
    throw new AllProvidersFailedError(attempts);
  }

  // Primeiro os provedores disponíveis, na ordem de prioridade; os pausados vão para o fim (são
  // tentados só se todos os disponíveis falharem: melhor tentar de novo do que não responder).
  orderForRequest() {
    const ready = this.links.filter(l => !l.breaker.isOpen);
    const paused = this.links.filter(l => l.breaker.isOpen);
    for (const l of paused) this.onEvent({ type: 'skip', provider: l.provider.id, reason: l.breaker.lastFailure });
    return [...ready, ...paused];
  }

  status() {
    return this.links.map(({ provider, breaker }) => ({
      id: provider.id,
      name: provider.name,
      model: provider.model,
      configured: provider.configured,
      ...(provider.configured ? breaker.snapshot() : { state: 'sem_chave' }),
    }));
  }

  get ready() { return this.links.some(l => l.provider.configured); }
}

const attempt = (provider, kind, detail = '') => ({ id: provider.id, name: provider.name, kind, detail });
