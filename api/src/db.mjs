// Conexão com o MySQL (pool do mysql2). Usa o usuário da aplicação (só DML), nunca o root, e sempre TLS
// verificado (CA de DB_SSL_CA + nome do host). Sem a CA a API não sobe: explica no log e sai.
import mysql from 'mysql2/promise';
import { DB, dbSsl } from './config.mjs';

let ssl;
try { ssl = dbSsl(); } catch (e) {
  console.error(new Date().toISOString(), 'API não iniciada: TLS do banco não configurado —', e.message);
  process.exit(1);
}

export const pool = mysql.createPool({ ...DB, ssl, waitForConnections: true, connectionLimit: 10, dateStrings: false });

export async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// motivo da última falha do ping (para o log; nunca vai para a resposta HTTP)
export let lastPingError = null;
export async function ping() {
  try { await pool.query('SELECT 1'); lastPingError = null; return true; } catch (e) { lastPingError = `${e.code || ''} ${e.message}`.trim(); return false; }
}

// roda fn(conn) numa transação: commit se der certo, rollback se lançar erro
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn({ query: async (sql, params) => (await conn.execute(sql, params))[0] });
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}
