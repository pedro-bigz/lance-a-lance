// Depois do "vite build": transforma dist/index.html (documento completo) em dist/lance-a-lance.html, o fragmento
// publicado como artifact e usado pelo app desktop. Os dois põem o próprio esqueleto em volta (<!doctype>, <html>,
// <head>, <body>, metas e o estilo [hidden]), então aqui saem o esqueleto e o bloco data-dev-only de index.html.
// O script do app (módulo, já com JS e CSS embutidos) vai para o fim, depois da marcação, como na página original.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const src = join(dist, 'index.html');
if (!existsSync(src)) throw new Error('dist/index.html não existe: rode "vite build" antes');
const html = readFileSync(src, 'utf8');

const head = /<head>([\s\S]*?)<\/head>/.exec(html);
const body = /<body>([\s\S]*?)<\/body>/.exec(html);
if (!head || !body) throw new Error('dist/index.html sem <head> ou <body>');

let top = head[1]
  .replace(/<meta charset="[^"]*">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<!--[\s\S]*?-->\s*/g, '')
  .replace(/<style data-dev-only>[\s\S]*?<\/style>\s*/, '');
// o script do app (inline, type="module") sai do <head> e vai para o fim da página
const scripts = [];
top = top.replace(/<script type="module"[^>]*>[\s\S]*?<\/script>\s*/g, (s) => {
  scripts.push(s.trim());
  return '';
});
if (scripts.length !== 1) throw new Error(`esperava 1 script de módulo no <head>, achei ${scripts.length}`);
if (/<script[^>]+src=|<link[^>]+href="\.?\/?assets\//.test(top + body[1])) throw new Error('sobrou referência a arquivo externo do bundle');

const out = `${top.trim()}\n${body[1].trim()}\n${scripts[0]}\n`;
writeFileSync(join(dist, 'lance-a-lance.html'), out);
rmSync(src);
console.log(`dist/lance-a-lance.html pronto (${(Buffer.byteLength(out) / 1024).toFixed(0)} KB)`);
