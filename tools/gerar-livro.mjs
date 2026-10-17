// Gera o livro de aberturas embutido no lance-a-lance.html.
// Fontes: tools/livro/{a..e}.tsv (lichess-org/chess-openings, domínio público CC0) e
// tools/livro/curadas.txt (linhas com nomes em português, "Família|Variante|lances"; têm prioridade no nome).
// Cada posição do livro vira um hash de 53 bits (base 36) ligado ao índice do nome da abertura (ou -1 sem nome).
// Uso: node tools/gerar-livro.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Chess } = require(join(root, 'desktop', 'vendor', 'chess.min.js'));

// mesmo hash usado na página (cyrb53)
export function cyrb53(str, seed = 0){
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const posKey = fen => fen.split(' ').slice(0, 4).join(' ');

// ---- tradução dos nomes do Lichess para português ----
const FAMILIES = {
  'Sicilian Defense': 'Defesa Siciliana', 'Ruy Lopez': 'Ruy López', 'French Defense': 'Defesa Francesa',
  "Queen's Gambit Declined": 'Gambito da Dama Recusado', "Queen's Gambit Accepted": 'Gambito da Dama Aceito', "Queen's Gambit": 'Gambito da Dama',
  'Italian Game': 'Abertura Italiana', 'English Opening': 'Abertura Inglesa', "King's Gambit Accepted": 'Gambito do Rei Aceito',
  "King's Gambit Declined": 'Gambito do Rei Recusado', "King's Gambit": 'Gambito do Rei', "King's Indian Defense": 'Defesa Índia do Rei',
  'Caro-Kann Defense': 'Defesa Caro-Kann', 'Nimzo-Indian Defense': 'Defesa Nimzoíndia', "Queen's Pawn Game": 'Jogo do Peão da Dama',
  'Semi-Slav Defense': 'Defesa Semi-Eslava', 'Slav Defense': 'Defesa Eslava', 'Dutch Defense': 'Defesa Holandesa', 'Benoni Defense': 'Defesa Benoni',
  'Grünfeld Defense': 'Defesa Grünfeld', 'Neo-Grünfeld Defense': 'Defesa Neo-Grünfeld', "Queen's Indian Defense": 'Defesa Índia da Dama',
  'Alekhine Defense': 'Defesa Alekhine', 'Indian Defense': 'Defesa Índia', 'Scotch Game': 'Abertura Escocesa', "Petrov's Defense": 'Defesa Petrov',
  'Four Knights Game': 'Abertura dos Quatro Cavalos', 'Three Knights Opening': 'Abertura dos Três Cavalos', 'Zukertort Opening': 'Abertura Zukertort',
  'Scandinavian Defense': 'Defesa Escandinava', 'Philidor Defense': 'Defesa Philidor', 'Réti Opening': 'Abertura Réti',
  'Nimzowitsch Defense': 'Defesa Nimzowitsch', "Bishop's Opening": 'Abertura do Bispo', 'Vienna Game': 'Abertura Vienense', 'Vienna Gambit': 'Gambito Vienense',
  'Modern Defense': 'Defesa Moderna', "King's Pawn Game": 'Jogo do Peão do Rei', 'Catalan Opening': 'Abertura Catalã', 'Bird Opening': 'Abertura Bird',
  'Pirc Defense': 'Defesa Pirc', 'Tarrasch Defense': 'Defesa Tarrasch', 'Polish Opening': 'Abertura Polonesa', 'Bogo-Indian Defense': 'Defesa Bogo-Índia',
  'Grob Opening': 'Abertura Grob', 'Hungarian Opening': 'Abertura Húngara', "King's Indian Attack": 'Ataque Índio do Rei',
  'Nimzo-Larsen Attack': 'Ataque Nimzo-Larsen', 'Center Game': 'Abertura Central', 'Latvian Gambit': 'Gambito Letão', 'Latvian Gambit Accepted': 'Gambito Letão Aceito',
  'Ponziani Opening': 'Abertura Ponziani', 'Old Indian Defense': 'Defesa Índia Antiga', 'Trompowsky Attack': 'Ataque Trompowsky',
  'Englund Gambit': 'Gambito Englund', 'Benko Gambit': 'Gambito Benko', 'Benko Gambit Accepted': 'Gambito Benko Aceito', 'Benko Gambit Declined': 'Gambito Benko Recusado',
  'Budapest Defense': 'Defesa Budapeste', 'Elephant Gambit': 'Gambito Elefante', 'London System': 'Sistema Londres', 'Colle System': 'Sistema Colle',
  'Torre Attack': 'Ataque Torre', 'Danish Gambit': 'Gambito Dinamarquês', 'Danish Gambit Accepted': 'Gambito Dinamarquês Aceito', 'Owen Defense': 'Defesa Owen',
  'Blackmar-Diemer Gambit': 'Gambito Blackmar-Diemer', 'Blackmar-Diemer Gambit Accepted': 'Gambito Blackmar-Diemer Aceito', 'Rat Defense': 'Defesa Rato',
  'Van Geet Opening': 'Abertura Van Geet', 'Pterodactyl Defense': 'Defesa Pterodáctilo', 'Kádas Opening': 'Abertura Kádas', 'Amar Opening': 'Abertura Amar',
  'Horwitz Defense': 'Defesa Horwitz', 'Mieses Opening': 'Abertura Mieses', "Queen's Indian Accelerated": 'Índia da Dama Acelerada',
  'Rapport-Jobava System': 'Sistema Rapport-Jobava', 'Richter-Veresov Attack': 'Ataque Richter-Veresov', 'Semi-Slav Defense Accepted': 'Defesa Semi-Eslava Aceita',
};
const WORDS = [
  [/\bMain Line\b/g, 'Linha principal'], [/\bAccelerated Dragon\b/g, 'Dragão Acelerado'], [/\bTwo Knights\b/g, 'Dois Cavalos'],
  [/\bExchange\b/g, 'Trocas'], [/\bAccepted\b/g, 'Aceito'], [/\bDeclined\b/g, 'Recusado'], [/\bClassical\b/g, 'Clássica'], [/\bModern\b/g, 'Moderna'],
  [/\bAdvance\b/g, 'Avanço'], [/\bClosed\b/g, 'Fechada'], [/\bOpen\b/g, 'Aberta'], [/\bDragon\b/g, 'Dragão'], [/\bwith\b/g, 'com'], [/\bQueen's\b/g, 'da Dama'],
  [/\bKing's\b/g, 'do Rei'], [/\bKnight\b/g, 'Cavalo'], [/\bBishop\b/g, 'Bispo'], [/\bCounterattack\b/g, 'Contra-ataque'], [/\bCountergambit\b/g, 'Contragambito'],
];
function translatePart(p){
  p = p.trim();
  for (const [re, to] of WORDS) p = p.replace(re, to);
  p = p.replace(/(\w)'s\b/g, '$1');
  return p
    .replace(/^(.+?) Gambit (Aceito|Recusado)$/, 'Gambito $1 $2').replace(/^(.+?) Defense (Aceito|Recusado)$/, 'Defesa $1 $2')
    .replace(/^(.+?) Variation$/, 'Variante $1').replace(/^(.+?) Attack$/, 'Ataque $1').replace(/^(.+?) Gambit$/, 'Gambito $1')
    .replace(/^(.+?) Defense$/, 'Defesa $1').replace(/^(.+?) System$/, 'Sistema $1').replace(/^(.+?) Line$/, 'Linha $1')
    .replace(/^(.+?) Opening$/, 'Abertura $1').replace(/^(.+?) Game$/, 'Jogo $1').replace(/^(.+?) Trap$/, 'Armadilha $1');
}
function translate(name){
  const [fam, rest] = name.split(/:\s*/, 2);
  const family = FAMILIES[fam] || translatePart(fam);
  return rest ? `${family}: ${rest.split(',').map(translatePart).join(', ')}` : family;
}

// ---- monta o livro ----
const book = new Map();      // hash -> índice do nome (-1 = posição de livro sem nome próprio)
const names = [], nameIdx = new Map();
const named = new Map();     // hash -> nome em português curado (prioridade)
const lines = [];            // linhas completas com nome, para o tutor de IA (busca e treino)
const idxOf = n => { if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); } return nameIdx.get(n); };
function play(sans, label, onEnd){
  const c = new Chess();
  for (const san of sans) {
    if (!c.move(san, {sloppy: true})) { console.warn('lance inválido', san, 'em', label); return null; }
    const h = cyrb53(posKey(c.fen()));
    if (!book.has(h)) book.set(h, -1);
  }
  return cyrb53(posKey(c.fen()));
}
// curadas: o nome vale para todas as posições da linha que ainda não têm nome curado mais específico
const curated = readFileSync(join(root, 'tools', 'livro', 'curadas.txt'), 'utf8').trim().split('\n');
for (const line of curated) {
  const [family, variant, moves] = line.split('|');
  const label = variant === 'Linha principal' ? family : `${family}: ${variant}`;
  const sans = moves.trim().split(/\s+/);
  const h = play(sans, label);
  if (h != null) { named.set(h, label); lines.push([label, sans]); }
}
let count = 0;
for (const f of 'abcde') {
  const rows = readFileSync(join(root, 'tools', 'livro', `${f}.tsv`), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [, name, pgn] = row.split('\t');
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
    const h = play(sans, name);
    if (h == null) continue;
    count++;
    const pt = translate(name);
    if (book.get(h) === -1) book.set(h, idxOf(pt));
    lines.push([pt, sans]);
  }
}
for (const [h, label] of named) book.set(h, idxOf(label));

const entries = [...book].map(([h, i]) => `${h.toString(36)}${i >= 0 ? ':' + i.toString(36) : ''}`).join(',');
// linhas: "índiceDoNome|lances", com os lances já normalizados pelo chess.js (SAN com + e #)
const lineStr = lines.map(([n, sans]) => { const c = new Chess(); const out = []; for (const san of sans) { const m = c.move(san, {sloppy: true}); if (!m) break; out.push(m.san); } return `${idxOf(n).toString(36)}|${out.join(' ')}`; }).join('\n');
const data = `const BOOK_DATA = ${JSON.stringify({names, pos: entries, lines: lineStr})};`;

const htmlPath = join(root, 'lance-a-lance.html');
const html = readFileSync(htmlPath, 'utf8');
const start = '/* LIVRO:INICIO (gerado por tools/gerar-livro.mjs) */', end = '/* LIVRO:FIM */';
const a = html.indexOf(start), b = html.indexOf(end);
if (a < 0 || b < 0) throw new Error('marcadores do livro não encontrados no HTML');
writeFileSync(htmlPath, html.slice(0, a + start.length) + '\n' + data + '\n' + html.slice(b));
console.log(`livro: ${book.size} posições, ${names.length} nomes, ${count} linhas do Lichess + ${curated.length} curadas; ${(data.length / 1024).toFixed(0)} KB`);
