// Monta desktop/app/ a partir da página única ../lance-a-lance.html (a mesma publicada como artifact):
// troca as fontes e o chess.js da CDN pelas cópias em vendor/, para o app funcionar offline.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', 'lance-a-lance.html');
const out = join(root, 'app');

let html = readFileSync(src, 'utf8');

const swaps = [
  [/<link rel="preconnect"[^>]*>\s*/g, ''],
  [/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/, '<link rel="stylesheet" href="vendor/fonts.css">'],
  [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/chess\.js\/[^"]*"><\/script>/, '<script src="vendor/chess.min.js"></script>'],
];
for (const [re, to] of swaps) {
  if (!re.test(html)) throw new Error(`Trecho esperado não encontrado em lance-a-lance.html: ${re}`);
  html = html.replace(re, to);
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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
cpSync(join(root, '..', 'stockfish.asm.js'), join(out, 'stockfish.asm.js'));
cpSync(join(root, 'vendor'), join(out, 'vendor'), { recursive: true });
cpSync(join(root, '..', 'pieces'), join(out, 'pieces'), { recursive: true });
console.log('app/ pronto');
