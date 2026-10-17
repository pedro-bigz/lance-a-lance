// Erros dos provedores de IA. Cada falha tem um tipo (FAILURE): a cadeia de fallback e o circuit
// breaker decidem pelo tipo, sem precisar conhecer o formato de erro de cada provedor.

export const FAILURE = Object.freeze({
  NOT_CONFIGURED: 'sem_chave',      // falta a chave no .env
  AUTH: 'chave_recusada',           // o provedor recusou a chave
  CONFIG: 'configuracao_invalida',  // modelo ou endereço que o provedor não reconhece (404)
  QUOTA: 'sem_credito',             // saldo ou cota grátis esgotados
  RATE_LIMIT: 'limite_por_minuto',  // muitas requisições seguidas; volta logo
  UNAVAILABLE: 'indisponivel',      // erro 5xx, rede ou resposta sem conteúdo
  TIMEOUT: 'demorou_demais',
  INVALID_REQUEST: 'pedido_recusado',
});

// texto curto por tipo de falha, para o log do servidor (o usuário final recebe só uma mensagem genérica)
export const FAILURE_TEXT = Object.freeze({
  [FAILURE.NOT_CONFIGURED]: 'sem chave configurada',
  [FAILURE.AUTH]: 'chave recusada',
  [FAILURE.CONFIG]: 'modelo ou endereço inválido',
  [FAILURE.QUOTA]: 'sem créditos',
  [FAILURE.RATE_LIMIT]: 'limite de mensagens por minuto',
  [FAILURE.UNAVAILABLE]: 'fora do ar',
  [FAILURE.TIMEOUT]: 'demorou demais',
  [FAILURE.INVALID_REQUEST]: 'recusou o pedido',
});

export class ProviderError extends Error {
  constructor(provider, kind, detail = '', status = 0) {
    super(`${provider}: ${FAILURE_TEXT[kind] || kind}${detail ? ` (${detail})` : ''}`);
    this.provider = provider;
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

// todos os provedores falharam; `attempts` traz o motivo de cada um, na ordem tentada
export class AllProvidersFailedError extends Error {
  constructor(attempts) {
    super('Nenhuma IA respondeu: ' + attempts.map(a => `${a.name} ${FAILURE_TEXT[a.kind] || a.kind}`).join('; ') + '.');
    this.attempts = attempts;
  }
  // todos sem crédito (ou sem chave) é problema de conta, não de rede: 402 em vez de 503
  get onlyBilling() {
    return this.attempts.length > 0 && this.attempts.every(a => a.kind === FAILURE.QUOTA || a.kind === FAILURE.NOT_CONFIGURED);
  }
}

// o cliente (app) desistiu da conversa: não é falha de provedor e não deve passar para o próximo
export class RequestCancelledError extends Error {
  constructor() { super('pedido cancelado pelo cliente'); }
}
