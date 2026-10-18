// Monta desktop/app/ a partir do build da interface (../ui/dist/lance-a-lance.html, a mesma página publicada como
// artifact): troca as fontes do Google pelas cópias em vendor/, para o app funcionar offline, e copia o Stockfish e
// as peças que o build deixa ao lado da página. Os arquivos do Stockfish são os da versão do build: a lista vem de
// ui/dist/engine.json (veja ui/build/stockfish-engine.ts), então qualquer versão registrada funciona sem mudar aqui.
// O chess.js já vai dentro do bundle da interface.
// Antes, roda o build da ui (vite build + scripts/finalize.mjs, o mesmo "pnpm build" de ui/) com as dependências
// instaladas em ui/node_modules. Com --skip-ui-build usa o ui/dist que já existe.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = join(root, '..', 'ui');
const uiDist = join(uiDir, 'dist');
const src = join(uiDist, 'lance-a-lance.html');
const out = join(root, 'app');

if (!process.argv.includes('--skip-ui-build')) {
  const vite = join(uiDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) {
    throw new Error('Dependências da interface não instaladas: rode "corepack pnpm@10.13.1 install" em ui/ e tente de novo.');
  }
  console.log('build da interface (ui/)…');
  execFileSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: uiDir, stdio: 'inherit' });
  execFileSync(process.execPath, [join(uiDir, 'scripts', 'finalize.mjs')], { cwd: uiDir, stdio: 'inherit' });
}
if (!existsSync(src)) {
  throw new Error(`Build da interface não encontrado (${src}): rode "corepack pnpm@10.13.1 build" em ui/.`);
}

let html = readFileSync(src, 'utf8');

const swaps = [
  [/<link rel="preconnect"[^>]*>\s*/g, ''],
  [/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/, '<link rel="stylesheet" href="vendor/fonts.css">'],
];
for (const [re, to] of swaps) {
  if (!re.test(html)) throw new Error(`Trecho esperado não encontrado em ui/dist/lance-a-lance.html: ${re}`);
  html = html.replace(re, to);
}
if (/<script[^>]+src="https?:/i.test(html)) throw new Error('A página ainda carrega script de fora (o app desktop precisa funcionar offline).');

const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': compilar o WebAssembly do Stockfish (o worker de app:// não herda esta CSP, mas fica explícito)
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "worker-src 'self'",
  "connect-src 'self'",
].join('; ');

const page = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>[hidden]{display:none!important}body{margin:0}img{max-width:100%}</style>
</head>
<body>
${html}
</body>
</html>
`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), page);
const engine = JSON.parse(readFileSync(join(uiDist, 'engine.json'), 'utf8'));
for (const f of engine.files) cpSync(join(uiDist, f), join(out, f));
cpSync(join(root, 'vendor'), join(out, 'vendor'), { recursive: true });
cpSync(join(uiDist, 'pieces'), join(out, 'pieces'), { recursive: true });
console.log(`app/ pronto (${engine.label}: ${engine.files.join(', ')})`);
