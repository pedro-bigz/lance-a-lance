// Provedores concretos. Cada um é uma subclasse de ChatProvider que muda só o que o provedor tem de
// diferente (cabeçalhos, corpo, códigos de erro); o fluxo da chamada fica na classe base.
import { ChatProvider } from './chat-provider.mjs';
import { FAILURE } from './errors.mjs';

// Gemini pela camada compatível com a OpenAI do Google AI Studio.
// Cota grátis esgotada chega como 429 RESOURCE_EXHAUSTED; a cota diária cita "PerDay" no texto.
export class GeminiProvider extends ChatProvider {
  buildBody(request) {
    // os modelos com raciocínio gastam parte do max_tokens pensando; com 1500 a resposta podia sair vazia
    return { ...super.buildBody(request), max_tokens: 4096 };
  }
  classify(status, error = {}) {
    const text = `${error.code} ${error.message}`;
    if (status === 429) return /per\s?day|daily/i.test(text) ? FAILURE.QUOTA : FAILURE.RATE_LIMIT;
    if (status === 400 && /api key|API_KEY_INVALID/i.test(text)) return FAILURE.AUTH;
    return super.classify(status, error);
  }
}

// DeepSeek: saldo zerado responde 402 "Insufficient Balance" (a classificação padrão já cobre).
export class DeepSeekProvider extends ChatProvider {}

// OpenRouter: 402 = sem créditos; o limite diário dos modelos grátis chega como 429 "free-models-per-day".
export class OpenRouterProvider extends ChatProvider {
  headers() {
    // identificam o app no painel do OpenRouter (opcionais)
    return { 'HTTP-Referer': 'https://lance-a-lance.local', 'X-Title': 'Lance a Lance' };
  }
  classify(status, error = {}) {
    if (status === 429 && /per-day|per day/i.test(error.message)) return FAILURE.QUOTA;
    return super.classify(status, error);
  }
}
