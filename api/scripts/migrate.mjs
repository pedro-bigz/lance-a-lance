// Aplica as migrações de db/migrations/ em ordem (001_..., 002_...) e registra cada uma em
// schema_migrations, para não aplicar duas vezes. Uso: pnpm db:migrate
// Entra com o usuário de migração (DB_MIGRATE_USER, com DDL), nunca com o da API (DB_USER, só DML),
// e sempre por TLS verificado (DB_SSL_CA), como a API.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { DB, DB_MIGRATOR, dbSsl } from '../src/config.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const files = readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();

if (!DB_MIGRATOR.user || !DB_MIGRATOR.password) {
  console.error('Falha ao migrar: preencha DB_MIGRATE_USER e DB_MIGRATE_PASSWORD no api/.env (o usuário da API não tem permissão de DDL). '
    + 'Para criar o usuário: pnpm db:users (README, seção Usuários do banco).');
  process.exit(1);
}
let ssl;
try { ssl = dbSsl(); } catch (e) { console.error('Falha ao migrar:', e.message); process.exit(1); }

let conn;
try { conn = await mysql.createConnection({ ...DB, ...DB_MIGRATOR, ssl, multipleStatements: true }); } catch (e) {
  console.error(`Falha ao conectar como ${DB_MIGRATOR.user} em ${DB.host}:${DB.port}:`, e.code || '', e.message);
  process.exit(1);
}
try {
  const [[tls]] = await conn.query("SHOW SESSION STATUS LIKE 'Ssl_version'");
  if (!tls?.Value) throw new Error('conexão sem TLS'); // não deve acontecer com ssl configurado; garantia extra
  console.log(`conectado como ${DB_MIGRATOR.user} (${tls.Value})`);
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await conn.query('SELECT version FROM schema_migrations');
  const done = new Set(rows.map(r => r.version));
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`aplicando ${f}… `);
    await conn.query(readFileSync(join(dir, f), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [f]);
    console.log('ok');
    applied++;
  }
  console.log(applied ? `${applied} migração(ões) aplicada(s).` : 'Banco já está atualizado.');
} catch (e) {
  console.error('\nFalha ao migrar:', e.code || '', e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
