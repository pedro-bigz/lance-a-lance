// Configuração lida do ambiente (api/.env, carregado por node --env-file=.env).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
// variável ausente ou vazia (ex.: GEMINI_URL= no .env, ou ${GEMINI_URL:-} no compose) usa o padrão
const str = (k, d = '') => String(env[k] ?? '').trim() || String(d).trim();

export const PORT = Number(env.PORT || 8787);
export const HOST = str('HOST', '127.0.0.1');                 // só a própria máquina, por padrão
export const RATE_PER_MIN = Number(env.RATE_LIMIT_PER_MIN || 30);
export const AUTH_RATE_PER_MIN = Number(env.AUTH_RATE_LIMIT_PER_MIN || 10);

// Tutor de IA: provedores no formato de chat da OpenAI, tentados na ordem de AI_PROVIDER_ORDER
// (o próximo entra quando o anterior falha ou fica sem crédito). Montagem em src/ai/index.mjs.
export const AI = {
  order: str('AI_PROVIDER_ORDER', 'gemini,deepseek,openrouter').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  timeoutMs: Number(env.AI_TIMEOUT_MS || 45000),             // por provedor
  quotaCooldownMin: Number(env.AI_QUOTA_COOLDOWN_MIN || 30),  // pausa de quem ficou sem crédito
  providers: {
    gemini: {
      name: 'Gemini',
      key: str('GEMINI_API_KEY'),
      url: str('GEMINI_URL', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),
      model: str('GEMINI_MODEL', 'gemini-3.8-flash'),
    },
    deepseek: {
      name: 'DeepSeek',
      key: str('DEEPSEEK_API_KEY'),
      url: str('DEEPSEEK_URL', 'https://api.deepseek.com/chat/completions'),
      model: str('DEEPSEEK_MODEL', 'deepseek-chat'),
    },
    openrouter: {
      name: 'OpenRouter',
      key: str('OPENROUTER_API_KEY'),
      url: str('OPENROUTER_URL', 'https://openrouter.ai/api/v1/chat/completions'),
      model: str('OPENROUTER_MODEL', 'openrouter/free'),        // roteia para um modelo grátis com ferramentas
    },
  },
};

export const DB = {
  host: str('DB_HOST', '127.0.0.1'),
  port: Number(env.DB_PORT || 3306),
  database: str('DB_NAME', 'lance_a_lance'),
  user: str('DB_USER', 'lance_app'),
  password: str('DB_PASSWORD'),
  charset: 'utf8mb4',
  timezone: 'Z',
};

// Usuário só das migrações (DDL). A API nunca usa: ela entra com DB_USER, que só tem SELECT/INSERT/UPDATE/DELETE.
export const DB_MIGRATOR = { user: str('DB_MIGRATE_USER'), password: str('DB_MIGRATE_PASSWORD') };

// TLS com o MySQL: sempre obrigatório, com verificação da cadeia (CA própria em db/tls/ca.pem, gerada por
// pnpm db:tls) e do nome do host contra o certificado. Sem a CA, lança erro: nunca conecta sem TLS em silêncio.
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function dbSsl() {
  const mode = str('DB_SSL', 'required').toLowerCase();
  if (mode !== 'required') {
    throw new Error(`DB_SSL=${mode} não é aceito: a conexão com o banco é sempre por TLS (use DB_SSL=required).`);
  }
  const caPath = resolve(API_DIR, str('DB_SSL_CA', 'db/tls/ca.pem'));
  let ca;
  try { ca = readFileSync(caPath, 'utf8'); } catch (e) {
    throw new Error(`CA do TLS do banco não encontrada em ${caPath} (DB_SSL_CA, ${e.code}). Gere com pnpm db:tls e recrie o MySQL (README, seção TLS).`);
  }
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error(`DB_SSL_CA (${caPath}) não é um certificado PEM.`);
  // verifyIdentity: o mysql2 só confere o nome do host com isso ligado (rejectUnauthorized confere só a cadeia)
  return { ca, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
}

export const JWT_SECRET = str('JWT_SECRET');
export const JWT_EXPIRES_IN = str('JWT_EXPIRES_IN', '12h');

// papéis (tabela roles, migração 002). O slug é o que circula no JWT e nas respostas.
export const ROLES = { ADMIN: 'administrador', PLAYER: 'jogador' };
