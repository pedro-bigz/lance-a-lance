// Peças e estilos do tabuleiro: glifos, conjuntos ilustrados (imagens em pieces/, ao lado da página) e o estilo salvo
import type { Color, PieceType } from 'chess.js';

export const GLYPH: Record<PieceType, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const HOLLOW: Record<PieceType, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
const LETTER: Record<PieceType, string> = { k: 'R', q: 'D', r: 'T', b: 'B', n: 'C', p: 'P' };

export interface StyleOption {
  id: string;
  name: string;
  img?: boolean;
  desc?: string;
}
export const BOARD_STYLES: StyleOption[] = [
  { id: 'floresta', name: 'Floresta' },
  { id: 'madeira', name: 'Madeira' },
  { id: 'torneio', name: 'Torneio' },
  { id: 'oceano', name: 'Oceano' },
  { id: 'marmore', name: 'Mármore' },
  { id: 'ametista', name: 'Ametista' },
  { id: 'coral', name: 'Coral' },
];
export const PIECE_STYLES: StyleOption[] = [
  { id: 'classico', name: 'Clássicas' },
  { id: 'diagrama', name: 'Diagrama' },
  { id: 'madeira', name: 'Madeira' },
  { id: 'rubi', name: 'Rubi e safira' },
  { id: 'letras', name: 'Letras' },
  // conjuntos ilustrados (imagens em pieces/<conjunto>/, recortadas de tools/estilos-gemini.jpg)
  { id: 'digital', name: 'Digital', img: true },
  { id: 'moderno', name: 'Moderno', img: true },
  { id: 'facetado', name: 'Facetado', img: true },
  { id: 'medieval', name: 'Medieval', img: true },
  { id: 'futurista', name: 'Futurista', img: true },
  { id: 'vintage', name: 'Vintage', img: true },
  { id: 'geometrico', name: 'Geométrico', img: true },
];
export const IMG_SETS = new Set(PIECE_STYLES.filter((p) => p.img).map((p) => p.id));
/** estilo salvo (preferências): tabuleiro, peças e animação de captura */
export const STYLE = { board: 'floresta', pieces: 'classico', capture: 'gota' };
export type StyleChoice = typeof STYLE;
// animações de captura: três na ideia da gota na água e duas diferentes (estilhaços e faíscas)
export const CAPTURE_STYLES: StyleOption[] = [
  { id: 'gota', name: 'Gota', desc: 'três anéis claros' },
  { id: 'agua', name: 'Água', desc: 'disco azul e anéis' },
  { id: 'respingo', name: 'Respingo', desc: 'anel e gotículas' },
  { id: 'estilhacos', name: 'Estilhaços', desc: 'a peça se parte' },
  { id: 'faiscas', name: 'Faíscas', desc: 'explosão de faíscas' },
  { id: 'nenhuma', name: 'Nenhuma', desc: 'sem animação, só o som' },
];
export function glyph(type: PieceType, color: Color, pieces = STYLE.pieces): string {
  if (pieces === 'letras') return LETTER[type];
  if (pieces === 'diagrama' && color === 'w') return HOLLOW[type];
  return GLYPH[type];
}
// peça como HTML: imagem nos conjuntos ilustrados, caractere nos demais
export function pieceSpan(type: PieceType, color: Color, pieces = STYLE.pieces): string {
  if (IMG_SETS.has(pieces)) return `<span class="pc ${color} img"><img src="pieces/${pieces}/${color}${type}.webp" alt="" draggable="false"></span>`;
  return `<span class="pc ${color}">${glyph(type, color, pieces)}</span>`;
}
export function preloadPieces(pieces: string): void {
  if (!IMG_SETS.has(pieces)) return;
  for (const c of 'wb')
    for (const t of 'kqrbnp') {
      const im = new Image();
      im.src = `pieces/${pieces}/${c}${t}.webp`;
    }
}
