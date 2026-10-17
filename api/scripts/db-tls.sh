#!/usr/bin/env bash
# Gera a CA própria e o certificado TLS do MySQL do docker-compose.yml em api/db/tls/.
# Uso: pnpm db:tls            (não sobrescreve o que já existe)
#      pnpm db:tls -- --force-server (só um certificado de servidor novo, mesma CA)
#      pnpm db:tls -- --force (gera CA e certificado novos; clientes que confiam na CA antiga param de conectar)
#
# Arquivos gerados (nenhum vai para o git nem para o app desktop):
#   ca.pem          certificado da CA — é o que a API (DB_SSL_CA), o DBeaver e o Workbench usam para verificar o servidor
#   ca-key.pem      chave da CA (600) — só serve para emitir um certificado novo; guarde fora da máquina se quiser
#   server-cert.pem certificado do servidor, SAN: IP:127.0.0.1, DNS:localhost, DNS:mysql, DNS:lance-a-lance-mysql
#   server-key.pem  chave do servidor (600) — montada só no container
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/db/tls"
FORCE=0
[[ "${1:-}" == "--" ]] && shift   # pnpm db:tls -- --force repassa o "--"
[[ "${1:-}" == "--force" ]] && FORCE=1
CA_DAYS=3650      # 10 anos
SERVER_DAYS=825   # ~2 anos e 3 meses: renove com --force-server antes de vencer (ver README)
[[ "${1:-}" == "--force-server" ]] && FORCE=2

command -v openssl >/dev/null || { echo "openssl não encontrado" >&2; exit 1; }
mkdir -p "$DIR"
chmod 700 "$DIR"
umask 077
cd "$DIR"

if [[ -f ca.pem && -f server-cert.pem && $FORCE -eq 0 ]]; then
  echo "Certificados já existem em $DIR (use --force para gerar CA nova ou --force-server só para o servidor)."
  openssl x509 -in server-cert.pem -noout -subject -enddate -ext subjectAltName
  exit 0
fi

if [[ $FORCE -ne 2 || ! -f ca-key.pem ]]; then
  openssl req -x509 -new -newkey rsa:3072 -nodes -sha256 -days "$CA_DAYS" \
    -keyout ca-key.pem -out ca.pem \
    -subj "/CN=Lance a Lance MySQL local CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
fi

openssl req -new -newkey rsa:3072 -nodes -sha256 \
  -keyout server-key.pem -out server.csr -subj "/CN=localhost"
cat > server.ext <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:mysql,DNS:lance-a-lance-mysql
EOF
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
  -days "$SERVER_DAYS" -sha256 -extfile server.ext -out server-cert.pem
rm -f server.csr server.ext ca.srl

# chaves só para o dono; certificados podem ser lidos (o mysqld do container lê todos)
chmod 600 ca-key.pem server-key.pem
chmod 644 ca.pem server-cert.pem
openssl verify -CAfile ca.pem server-cert.pem
openssl x509 -in server-cert.pem -noout -subject -enddate -ext subjectAltName
echo "Pronto. Recrie o container para usar o certificado novo: docker compose up -d --force-recreate --wait"
