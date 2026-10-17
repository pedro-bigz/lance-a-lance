// Provedor de chat no formato da OpenAI (/chat/completions), que Gemini, DeepSeek e OpenRouter aceitam.
//
// Padrão Template Method: `complete()` é o algoritmo fixo (montar o pedido, chamar com timeout,
// traduzir a resposta e classificar o erro). As subclasses mudam só os ganchos:
//   - headers()              cabeçalhos extras do provedor
//   - buildBody(request)     corpo do pedido (modelo, parâmetros)
//   - classify(status, err)  qual FAILURE um erro HTTP representa
import { FAILURE, ProviderError, RequestCancelledError } from './errors.mjs';

export class ChatProvider {
  /**
   * @param {object} cfg
   * @param {string} cfg.id       identificador estável (gemini, deepseek, openrouter)
   * @param {string} cfg.name     nome para o usuário
   * @param {string} cfg.url      endpoint /chat/completions
   * @param {string} cfg.key      chave da API (só no servidor)
   * @param {string} cfg.model
   * @param {number} cfg.timeoutMs
   */
  constructor({ id, name, url, key, model, timeoutMs }) {
    Object.assign(this, { id, name, url, key, model, timeoutMs });
  }

  get configured() { return Boolean(this.key); }

  headers() { return {}; }

  buildBody({ messages, tools }) {
    return {
      model: this.model,
      messages,
      tools: tools && tools.length ? tools : undefined,
      temperature: 0.6,
      max_tokens: 1500,
    };
  }

  // classificação padrão dos códigos HTTP; as subclasses refinam o que cada provedor usa de diferente
  classify(status /* , error: {message, code, raw} */) {
    if (status === 401 || status === 403) return FAILURE.AUTH;
    if (status === 402) return FAILURE.QUOTA;
    if (status === 429) return FAILURE.RATE_LIMIT;
    if (status === 404) return FAILURE.CONFIG;   // ex.: modelo descontinuado; só muda corrigindo o .env
    if (status === 400 || status === 413 || status === 422) return FAILURE.INVALID_REQUEST;
    return FAILURE.UNAVAILABLE;
  }

  /**
   * Faz uma rodada de chat. Resolve com {message, finish, usage}; rejeita com ProviderError
   * (ou RequestCancelledError quando o próprio cliente cancelou).
   * @param {{messages: object[], tools?: object[]}} request
   * @param {AbortSignal} [clientSignal]
   */
  async complete(request, clientSignal) {
    if (!this.configured) throw new ProviderError(this.name, FAILURE.NOT_CONFIGURED);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort('timeout'), this.timeoutMs);
    const onClientAbort = () => ctl.abort('client');
    clientSignal?.addEventListener('abort', onClientAbort, { once: true });
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}`, ...this.headers() },
        body: JSON.stringify(this.buildBody(request)),
      });
      const text = await res.text();
      if (!res.ok) {
        const error = parseError(text);
        throw new ProviderError(this.name, this.classify(res.status, error), error.message, res.status);
      }
      return this.parseSuccess(text);
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (ctl.signal.aborted && ctl.signal.reason === 'client') throw new RequestCancelledError();
      if (ctl.signal.aborted) throw new ProviderError(this.name, FAILURE.TIMEOUT);
      throw new ProviderError(this.name, FAILURE.UNAVAILABLE, e.cause?.code || e.message);
    } finally {
      clearTimeout(timer);
      clientSignal?.removeEventListener('abort', onClientAbort);
    }
  }

  parseSuccess(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new ProviderError(this.name, FAILURE.UNAVAILABLE, 'resposta não é JSON'); }
    // alguns provedores respondem 200 com {error} (ex.: o modelo de destino caiu no meio)
    if (data.error) throw new ProviderError(this.name, this.classify(Number(data.error.code) || 502, data.error), data.error.message);
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) throw new ProviderError(this.name, FAILURE.UNAVAILABLE, 'resposta sem mensagem');
    return { message: choice.message, finish: choice.finish_reason, usage: data.usage };
  }
}

// extrai {message, code, raw} dos formatos de erro mais comuns ({error:{...}} ou [{error:{...}}] no Gemini)
function parseError(text) {
  let body;
  try { body = JSON.parse(text); } catch (_) { return { message: text.slice(0, 200), code: '', raw: text }; }
  const err = (Array.isArray(body) ? body[0] : body)?.error || {};
  return { message: String(err.message || '').slice(0, 300), code: String(err.status || err.code || err.type || ''), raw: text };
}
