// Padrão Circuit Breaker: depois de uma falha, o provedor fica "aberto" (pulado) por um tempo que
// depende do tipo da falha. Assim, com o Gemini sem cota, as próximas mensagens vão direto para o
// DeepSeek, sem esperar o Gemini recusar de novo a cada pergunta.
import { FAILURE } from './errors.mjs';

const MIN = 60 * 1000;

export class CircuitBreaker {
  /**
   * @param {object} cooldownMs  tempo de pausa por tipo de falha (FAILURE → ms); 0 = não pausa
   * @param {() => number} [now] relógio injetável (testes)
   */
  constructor(cooldownMs, now = Date.now) {
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.openUntil = 0;
    this.lastFailure = null;
  }

  static withDefaults({ quotaCooldownMin = 30 } = {}, now) {
    return new CircuitBreaker({
      [FAILURE.QUOTA]: quotaCooldownMin * MIN,
      [FAILURE.AUTH]: quotaCooldownMin * MIN,
      [FAILURE.CONFIG]: quotaCooldownMin * MIN,
      [FAILURE.RATE_LIMIT]: 1 * MIN,
      [FAILURE.UNAVAILABLE]: 0.5 * MIN,
      [FAILURE.TIMEOUT]: 0.5 * MIN,
      [FAILURE.INVALID_REQUEST]: 0,     // o problema pode ser só esta conversa
      [FAILURE.NOT_CONFIGURED]: 0,      // sem chave é conferido a cada pedido (configured)
    }, now);
  }

  get isOpen() { return this.now() < this.openUntil; }

  recordFailure(kind) {
    this.lastFailure = kind;
    this.openUntil = this.now() + (this.cooldownMs[kind] || 0);
  }

  recordSuccess() {
    this.lastFailure = null;
    this.openUntil = 0;
  }

  // para o /health: {state, until?, reason?}
  snapshot() {
    if (this.isOpen) return { state: 'pausado', until: new Date(this.openUntil).toISOString(), reason: this.lastFailure };
    return { state: 'disponivel' };
  }
}
