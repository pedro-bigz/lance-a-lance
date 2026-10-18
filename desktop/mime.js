'use strict';
// Tipos MIME do protocolo app:// (main.js). O .wasm do Stockfish precisa de application/wasm: o worker compila por
// WebAssembly.instantiateStreaming, que recusa outro tipo. Os demais vão explícitos para não depender do palpite do
// Chromium para file://. Extensão fora do mapa: fica o tipo que o net.fetch deu.
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || null;
}

module.exports = { MIME, mimeFor };
