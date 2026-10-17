#!/usr/bin/env bash
# Backup do banco do Lance a Lance (MySQL do docker-compose.yml).
# Uso: pnpm db:backup   (o LaunchAgent com.lance-a-lance.backup roda este script todo dia às 03:00)
#
# - mysqldump de dentro do container, entrando como root pelo socket; a senha vem da variável
#   MYSQL_ROOT_PASSWORD do próprio container (não aparece em linha de comando nem em arquivo novo)
# - grava ~/Backups/lance-a-lance/lance_a_lance-AAAAMMDD-HHMMSS.sql.gz (pasta 700, arquivos 600)
# - confere o arquivo (gzip íntegro, fim do dump, as 6 tabelas) antes de aceitá-lo; se algo falhar,
#   apaga o parcial e sai com erro (nunca deixa arquivo vazio ou truncado com o nome final)
# - mantém os 14 mais recentes (KEEP) e apaga os mais antigos
# - log em ~/Library/Logs/lance-a-lance/backup.log
#
# O dump não tem CREATE DATABASE/USE: restaura no banco que você escolher (ver README, "Backup").
set -euo pipefail
umask 077
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

CONTAINER="${LAL_DB_CONTAINER:-lance-a-lance-mysql}"
DB_NAME="${LAL_DB_NAME:-lance_a_lance}"
DEST="${LAL_BACKUP_DIR:-$HOME/Backups/lance-a-lance}"
LOG_DIR="$HOME/Library/Logs/lance-a-lance"
LOG="$LOG_DIR/backup.log"
KEEP="${LAL_BACKUP_KEEP:-14}"
TABLES=(games player_stats rating_history roles schema_migrations users)

mkdir -p "$DEST" "$LOG_DIR"
chmod 700 "$DEST" "$LOG_DIR"
log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" | tee -a "$LOG" >&2; }

TMP=""
LOCK="$DEST/.backup.lock"
cleanup() { [[ -n "$TMP" && -f "$TMP" ]] && rm -f "$TMP"; rmdir "$LOCK" 2>/dev/null || true; }
fail() { log "ERRO: $*"; exit 1; }

mkdir "$LOCK" 2>/dev/null || { log "ERRO: outro backup em andamento ($LOCK); se não houver, apague a pasta"; exit 1; }
trap cleanup EXIT

command -v docker >/dev/null || fail "docker não encontrado no PATH"
docker info >/dev/null 2>&1 || fail "Docker não está rodando (abra o Docker Desktop)"
state="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER" 2>/dev/null)" \
  || fail "container $CONTAINER não existe (suba com: pnpm db:up)"
[[ "$state" == running* ]] || fail "container $CONTAINER não está rodando ($state; suba com: pnpm db:up)"
[[ "$state" == *unhealthy* ]] && fail "container $CONTAINER está unhealthy"

STAMP="$(date '+%Y%m%d-%H%M%S')"
FINAL="$DEST/${DB_NAME}-${STAMP}.sql.gz"
TMP="$DEST/.${DB_NAME}-${STAMP}.sql.gz.part"

log "início: $DB_NAME → $FINAL"
# $MYSQL_ROOT_PASSWORD é expandido dentro do container (aspas simples): o valor não passa por aqui
docker exec -e LAL_DB="$DB_NAME" "$CONTAINER" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot \
    --single-transaction --routines --triggers --events --hex-blob --set-gtid-purged=OFF \
    --default-character-set=utf8mb4 "$LAL_DB"' 2>>"$LOG" | gzip -9 > "$TMP" \
  || fail "mysqldump falhou (detalhes acima neste log)"

# conferência antes de aceitar o arquivo
[[ -s "$TMP" ]] || fail "dump vazio"
gzip -t "$TMP" || fail "gzip corrompido"
gzip -dc "$TMP" | tail -n 1 | grep -q '^-- Dump completed' || fail "dump incompleto (sem 'Dump completed')"
created="$(gzip -dc "$TMP" | grep -c '^CREATE TABLE ' || true)"
for t in "${TABLES[@]}"; do
  gzip -dc "$TMP" | grep -q "^CREATE TABLE \`$t\`" || fail "dump sem a tabela $t"
done
chmod 600 "$TMP"
mv "$TMP" "$FINAL"
TMP=""
size="$(stat -f %z "$FINAL")"
log "ok: $FINAL ($size bytes, $created tabelas)"

# retenção: mantém os KEEP mais recentes (o nome tem a data, então a ordem alfabética é a cronológica)
old="$(ls -1 "$DEST"/"${DB_NAME}"-????????-??????.sql.gz 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))")"
if [[ -n "$old" ]]; then
  while IFS= read -r f; do rm -f -- "$f" && log "retenção: apagado $(basename "$f")"; done <<< "$old"
fi
