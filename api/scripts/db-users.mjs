// Cria ou ajusta os usuários do MySQL a partir do api/.env. Idempotente: pode rodar quantas vezes quiser.
// Uso: pnpm db:users   (depois de pnpm db:up; entra como root, por TLS verificado, com MYSQL_ROOT_PASSWORD)
//
//   DB_USER         (lance_app)      a API: só SELECT, INSERT, UPDATE, DELETE no banco DB_NAME
//   DB_MIGRATE_USER (lance_migrator) as migrações: DML + CREATE, ALTER, DROP, INDEX, REFERENCES no banco DB_NAME
//   root@'%'                         mantido (DBeaver), mas com TLS obrigatório
//
// Todos com REQUIRE SSL. A senha de cada um é a do .env (rodar de novo depois de trocar a senha no .env
// aplica a senha nova). Privilégios fora dessa lista (globais, em outros bancos ou por tabela) são revogados.
import mysql from 'mysql2/promise';
import { DB, DB_MIGRATOR, dbSsl } from '../src/config.mjs';

const DML = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const DDL = ['CREATE', 'ALTER', 'DROP', 'INDEX', 'REFERENCES'];
// privilégios de banco do MySQL 8.4 → coluna em mysql.db (para revogar só o que sobrar: REVOKE de um
// privilégio que a conta não tem dá erro 1141)
const DB_LEVEL = {
  'SELECT': 'Select_priv', 'INSERT': 'Insert_priv', 'UPDATE': 'Update_priv', 'DELETE': 'Delete_priv',
  'CREATE': 'Create_priv', 'DROP': 'Drop_priv', 'GRANT OPTION': 'Grant_priv', 'REFERENCES': 'References_priv',
  'INDEX': 'Index_priv', 'ALTER': 'Alter_priv', 'CREATE TEMPORARY TABLES': 'Create_tmp_table_priv',
  'LOCK TABLES': 'Lock_tables_priv', 'CREATE VIEW': 'Create_view_priv', 'SHOW VIEW': 'Show_view_priv',
  'CREATE ROUTINE': 'Create_routine_priv', 'ALTER ROUTINE': 'Alter_routine_priv', 'EXECUTE': 'Execute_priv',
  'EVENT': 'Event_priv', 'TRIGGER': 'Trigger_priv',
};

const fail = (msg) => { console.error('db:users:', msg); process.exit(1); };
const rootPassword = String(process.env.MYSQL_ROOT_PASSWORD || '').trim();
const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;

const accounts = [
  { user: DB.user, password: DB.password, privs: DML, envUser: 'DB_USER', envPwd: 'DB_PASSWORD' },
  { user: DB_MIGRATOR.user, password: DB_MIGRATOR.password, privs: [...DML, ...DDL], envUser: 'DB_MIGRATE_USER', envPwd: 'DB_MIGRATE_PASSWORD' },
];
if (!rootPassword) fail('preencha MYSQL_ROOT_PASSWORD no api/.env');
if (!NAME_RE.test(DB.database)) fail(`DB_NAME inválido: ${DB.database}`);
for (const a of accounts) {
  if (!NAME_RE.test(a.user) || a.user === 'root') fail(`${a.envUser} inválido (letras minúsculas, números e _; não pode ser root)`);
  if (a.password.length < 16) fail(`${a.envPwd} vazia ou curta demais (mínimo 16 caracteres)`);
}
if (accounts[0].user === accounts[1].user) fail('DB_USER e DB_MIGRATE_USER precisam ser usuários diferentes');

let ssl;
try { ssl = dbSsl(); } catch (e) { fail(e.message); }

// Em GRANT, _ e % no nome do banco são curingas: escapa para valer só para este banco
const dbEscaped = DB.database.replace(/[_%]/g, '\\$&');
const dbGrant = '`' + dbEscaped + '`.*';

let conn;
try {
  conn = await mysql.createConnection({ host: DB.host, port: DB.port, user: 'root', password: rootPassword, ssl });
} catch (e) { fail(`não conectou como root em ${DB.host}:${DB.port}: ${e.code || ''} ${e.message}`); }

try {
  for (const a of accounts) {
    await conn.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ? REQUIRE SSL', [a.user, '%', a.password]);
    await conn.query('ALTER USER ?@? IDENTIFIED BY ? REQUIRE SSL', [a.user, '%', a.password]);
    // privilégios globais (*.*) não deveriam existir. Atenção: no MySQL 8.4, REVOKE ALL ON *.* também apaga os
    // de banco; por isso só roda quando há algum global, e antes do GRANT abaixo
    const [[glob]] = await conn.query('SELECT * FROM mysql.user WHERE User = ? AND Host = ?', [a.user, '%']);
    const [dyn] = await conn.query('SELECT PRIV FROM mysql.global_grants WHERE USER = ? AND HOST = ?', [a.user, '%']);
    if (Object.entries(glob).some(([k, v]) => k.endsWith('_priv') && v === 'Y') || dyn.length) {
      console.warn(`aviso: ${a.user} tinha privilégios globais; revogados.`);
      await conn.query('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?', [a.user, '%']);
    }
    // concede primeiro e revoga o excedente depois: a conta nunca fica sem os privilégios que precisa
    await conn.query(`GRANT ${a.privs.join(', ')} ON ${dbGrant} TO ?@?`, [a.user, '%']);
    const [[row]] = await conn.query('SELECT * FROM mysql.db WHERE User = ? AND Host = ? AND Db = ?', [a.user, '%', dbEscaped]);
    const extra = Object.entries(DB_LEVEL).filter(([p, col]) => !a.privs.includes(p) && row?.[col] === 'Y').map(([p]) => p);
    if (extra.length) await conn.query(`REVOKE ${extra.join(', ')} ON ${dbGrant} FROM ?@?`, [a.user, '%']);
    const [others] = await conn.query('SELECT Db FROM mysql.db WHERE User = ? AND Host = ? AND Db <> ?', [a.user, '%', dbEscaped]);
    for (const { Db } of others) await conn.query(`REVOKE ALL PRIVILEGES ON \`${Db.replace(/`/g, '``')}\`.* FROM ?@?`, [a.user, '%']);
    const [tables] = await conn.query('SELECT Db, Table_name FROM mysql.tables_priv WHERE User = ? AND Host = ?', [a.user, '%']);
    for (const t of tables) await conn.query(`REVOKE ALL PRIVILEGES ON \`${t.Db.replace(/`/g, '``')}\`.\`${t.Table_name.replace(/`/g, '``')}\` FROM ?@?`, [a.user, '%']);
    // contas com o mesmo nome em outros hosts (ex.: 'localhost') escapariam da regra: só avisa
    const [hosts] = await conn.query('SELECT Host FROM mysql.user WHERE User = ? AND Host <> ?', [a.user, '%']);
    for (const { Host } of hosts) console.warn(`aviso: existe também ${a.user}@${Host}; revise ou remova (DROP USER).`);
  }
  const [rootAny] = await conn.query("SELECT 1 FROM mysql.user WHERE User = 'root' AND Host = '%'");
  if (rootAny.length) await conn.query("ALTER USER 'root'@'%' REQUIRE SSL");

  const [users] = await conn.query("SELECT User, Host, ssl_type FROM mysql.user WHERE User IN (?, ?, 'root') ORDER BY User, Host",
    [accounts[0].user, accounts[1].user]);
  for (const u of users) {
    const [grants] = await conn.query('SHOW GRANTS FOR ?@?', [u.User, u.Host]);
    console.log(`${u.User}@${u.Host}  TLS: ${u.ssl_type === 'ANY' ? 'obrigatório' : u.ssl_type || 'opcional'}`);
    if (u.User !== 'root') for (const g of grants) console.log('   ', Object.values(g)[0]);
  }
  console.log('Usuários ajustados.');
} catch (e) {
  fail(`${e.code || ''} ${e.message}`);
} finally {
  await conn.end();
}
