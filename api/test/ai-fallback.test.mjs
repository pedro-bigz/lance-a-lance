// Testes da cadeia de IA com fetch simulado (nenhuma chamada real aos provedores).
// Rodar: pnpm test
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FallbackChain } from '../src/ai/fallback-chain.mjs';
import { CircuitBreaker } from '../src/ai/circuit-breaker.mjs';
import { DeepSeekProvider, GeminiProvider, OpenRouterProvider } from '../src/ai/providers.mjs';
import { AllProvidersFailedError, FAILURE, RequestCancelledError } from '../src/ai/errors.mjs';

const URLS = { gemini: 'https://gemini.test/chat', deepseek: 'https://deepseek.test/chat', openrouter: 'https://openrouter.test/chat' };
const REQUEST = { messages: [{ role: 'user', content: 'Qual a melhor resposta para 1.e4?' }] };

// respostas programadas por provedor: função (body) => {status, json} ou 'hang' (nunca responde)
let script, calls, realFetch, clock;
beforeEach(() => {
  script = {}; calls = []; clock = 1_000_000;
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const id = Object.keys(URLS).find(k => URLS[k] === url);
    calls.push(id);
    const step = script[id];
    if (step === 'hang') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const { status, json } = step(JSON.parse(init.body));
    return new Response(JSON.stringify(json), { status });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const ok = (text) => () => ({ status: 200, json: { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] } });
const err = (status, message, extra = {}) => () => ({ status, json: { error: { message, ...extra } } });

function chain({ keys = { gemini: 'g', deepseek: 'd', openrouter: 'o' }, timeoutMs = 1000 } = {}) {
  const make = (Cls, id) => new Cls({ id, name: id, url: URLS[id], key: keys[id] || '', model: 'm', timeoutMs });
  const breaker = () => CircuitBreaker.withDefaults({ quotaCooldownMin: 30 }, () => clock);
  return new FallbackChain([
    { provider: make(GeminiProvider, 'gemini'), breaker: breaker() },
    { provider: make(DeepSeekProvider, 'deepseek'), breaker: breaker() },
    { provider: make(OpenRouterProvider, 'openrouter'), breaker: breaker() },
  ]);
}

test('usa o Gemini primeiro quando ele responde', async () => {
  script.gemini = ok('Siciliana');
  const r = await chain().complete(REQUEST);
  assert.equal(r.provider, 'gemini');
  assert.equal(r.message.content, 'Siciliana');
  assert.deepEqual(calls, ['gemini']);
});

test('Gemini sem cota diária passa para o DeepSeek', async () => {
  script.gemini = err(429, 'Quota exceeded for GenerateRequestsPerDayPerProjectPerModel-FreeTier', { status: 'RESOURCE_EXHAUSTED' });
  script.deepseek = ok('Francesa');
  const r = await chain().complete(REQUEST);
  assert.equal(r.provider, 'deepseek');
  assert.deepEqual(calls, ['gemini', 'deepseek']);
});

test('Gemini e DeepSeek sem crédito: o OpenRouter responde', async () => {
  script.gemini = err(429, 'quota per day exceeded');
  script.deepseek = err(402, 'Insufficient Balance');
  script.openrouter = ok('Caro-Kann');
  const r = await chain().complete(REQUEST);
  assert.equal(r.provider, 'openrouter');
  assert.deepEqual(calls, ['gemini', 'deepseek', 'openrouter']);
});

test('quem ficou sem crédito é pulado nas próximas mensagens e volta depois da pausa', async () => {
  const c = chain();
  script.gemini = err(429, 'per day');
  script.deepseek = ok('a');
  await c.complete(REQUEST);
  calls = [];
  await c.complete(REQUEST);
  assert.deepEqual(calls, ['deepseek'], 'o Gemini pausado não é chamado');
  clock += 31 * 60 * 1000;
  script.gemini = ok('b');
  calls = [];
  assert.equal((await c.complete(REQUEST)).provider, 'gemini');
  assert.deepEqual(calls, ['gemini']);
});

test('se só sobram provedores pausados, tenta-os mesmo assim', async () => {
  const c = chain({ keys: { gemini: 'g' } });
  script.gemini = err(503, 'overloaded');
  await assert.rejects(c.complete(REQUEST), AllProvidersFailedError);
  script.gemini = ok('voltou');
  assert.equal((await c.complete(REQUEST)).provider, 'gemini');
});

test('provedor sem chave é pulado sem chamada', async () => {
  script.deepseek = ok('a');
  const r = await chain({ keys: { deepseek: 'd' } }).complete(REQUEST);
  assert.equal(r.provider, 'deepseek');
  assert.deepEqual(calls, ['deepseek']);
});

test('todos sem crédito: erro de cobrança com o motivo de cada um', async () => {
  script.gemini = err(429, 'per day');
  script.deepseek = err(402, 'Insufficient Balance');
  script.openrouter = err(402, 'Insufficient credits');
  const e = await chain().complete(REQUEST).catch(x => x);
  assert.ok(e instanceof AllProvidersFailedError);
  assert.equal(e.onlyBilling, true);
  assert.deepEqual(e.attempts.map(a => a.kind), [FAILURE.QUOTA, FAILURE.QUOTA, FAILURE.QUOTA]);
});

test('falhas de rede não contam como cobrança', async () => {
  script.gemini = err(500, 'internal');
  script.deepseek = err(401, 'bad key');
  script.openrouter = err(429, 'rate limited');
  const e = await chain().complete(REQUEST).catch(x => x);
  assert.equal(e.onlyBilling, false);
  assert.deepEqual(e.attempts.map(a => a.kind), [FAILURE.UNAVAILABLE, FAILURE.AUTH, FAILURE.RATE_LIMIT]);
});

test('resposta 200 com {error} também passa para o próximo', async () => {
  script.gemini = () => ({ status: 200, json: { error: { code: 502, message: 'upstream down' } } });
  script.deepseek = ok('a');
  assert.equal((await chain().complete(REQUEST)).provider, 'deepseek');
});

test('provedor que não responde dentro do prazo vira TIMEOUT e o próximo assume', async () => {
  script.gemini = 'hang';
  script.deepseek = ok('a');
  const r = await chain({ timeoutMs: 50 }).complete(REQUEST);
  assert.equal(r.provider, 'deepseek');
});

test('cancelamento do cliente interrompe a cadeia sem tentar o próximo', async () => {
  script.gemini = 'hang';
  script.deepseek = ok('a');
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(chain().complete(REQUEST, ctl.signal), RequestCancelledError);
  assert.deepEqual(calls, ['gemini']);
});

test('modelo que não existe mais (404) pausa o provedor como configuração inválida', async () => {
  script.gemini = err(404, 'This model models/gemini-x is no longer available to new users.');
  script.deepseek = ok('a');
  const c = chain();
  assert.equal((await c.complete(REQUEST)).provider, 'deepseek');
  assert.equal(c.status()[0].reason, FAILURE.CONFIG);
  calls = [];
  await c.complete(REQUEST);
  assert.deepEqual(calls, ['deepseek'], 'o Gemini mal configurado não é chamado de novo');
});

test('chave do Gemini inválida (400 API_KEY_INVALID) é classificada como chave recusada', async () => {
  script.gemini = err(400, 'API key not valid. Please pass a valid API key.', { status: 'INVALID_ARGUMENT' });
  script.deepseek = ok('a');
  const c = chain();
  await c.complete(REQUEST);
  assert.equal(c.status()[0].reason, FAILURE.AUTH);
});
