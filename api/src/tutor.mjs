// Rota do tutor de aberturas (adaptador HTTP): valida o pedido do app e repassa a conversa para a
// cadeia de IA (src/ai), que escolhe o provedor (Gemini → DeepSeek → OpenRouter) e troca sozinha
// quando um falha. As chaves moram só no api/.env; o app nunca as vê. A rota exige usuário logado
// (ver server.mjs).
import { send, readBody, HttpError } from './http.mjs';
import { tutorAi } from './ai/index.mjs';
import { AllProvidersFailedError, RequestCancelledError } from './ai/errors.mjs';

const log = (...a) => console.log(new Date().toISOString(), ...a);
// O cliente recebe só uma mensagem genérica: quais IAs existem, qual está sem crédito ou sem chave e como o
// servidor é configurado ficam no log do servidor, nunca na resposta.
const UNAVAILABLE = { ok: false, code: 'tutor_indisponivel', error: 'O tutor está indisponível no momento. Tente de novo mais tarde.' };

// aceita só o formato que o tutor usa: mensagens de chat e ferramentas (function calling)
const ROLES = new Set(['system', 'user', 'assistant', 'tool']);
function validate(payload) {
  if (!payload || typeof payload !== 'object') return 'JSON inválido';
  const { messages, tools } = payload;
  if (!Array.isArray(messages) || !messages.length || messages.length > 60) return 'messages deve ser uma lista de 1 a 60 mensagens';
  for (const m of messages) {
    if (!m || !ROLES.has(m.role)) return 'mensagem com role inválido';
    if (m.content != null && typeof m.content !== 'string') return 'content deve ser texto';
    if (m.role === 'tool' && typeof m.tool_call_id !== 'string') return 'mensagem tool sem tool_call_id';
  }
  if (tools != null && (!Array.isArray(tools) || tools.length > 16 || tools.some(t => !t || t.type !== 'function' || !t.function || typeof t.function.name !== 'string'))) return 'tools inválido';
  return null;
}

export async function chat(req, res) {
  if (!tutorAi.ready) { log('tutor: nenhuma IA configurada (veja AI_PROVIDER_ORDER e as chaves no .env)'); return send(res, 503, UNAVAILABLE); }
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, e instanceof HttpError ? e.status : 400, { ok: false, error: e instanceof HttpError ? e.message : 'JSON inválido' }); }
  const problem = validate(payload);
  if (problem) return send(res, 400, { ok: false, error: problem });

  // o app fechou a conversa: cancela a chamada ao provedor em andamento
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  try {
    const r = await tutorAi.complete({ messages: payload.messages, tools: payload.tools }, ctl.signal);
    return send(res, 200, { ok: true, provider: r.provider, provider_name: r.providerName, message: r.message, finish: r.finish, usage: r.usage });
  } catch (e) {
    if (e instanceof RequestCancelledError) return;   // ninguém mais espera a resposta
    if (e instanceof AllProvidersFailedError) {
      log(`tutor: ${e.message}`);
      return send(res, 503, UNAVAILABLE);
    }
    throw e;
  }
}

// estado detalhado das IAs, só para o log do servidor (o /health público mostra apenas se o tutor está pronto)
export const tutorStatus = () => ({ ready: tutorAi.ready, providers: tutorAi.status() });
