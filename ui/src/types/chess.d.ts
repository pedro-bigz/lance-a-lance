// Tipos do chess.js 0.10.3 (o pacote não traz tipos). Só a parte da API que a interface usa, no formato
// dessa versão: board() devolve {type, color} sem a casa (a casa sai da posição na matriz) e move/load_pgn
// aceitam {sloppy: true}. Versões 0.12+ mudam isso; não atualize o pacote sem revisar estes tipos.
declare module 'chess.js' {
  export type Color = 'w' | 'b';
  export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  /** Casa em notação algébrica ("e4"). */
  export type Square = string;

  export interface Piece {
    type: PieceType;
    color: Color;
  }

  export interface Move {
    color: Color;
    from: Square;
    to: Square;
    /** n, b, e (en passant), c (captura), p (promoção), k/q (roque pequeno/grande), combinadas. */
    flags: string;
    piece: PieceType;
    san: string;
    captured?: PieceType;
    promotion?: PieceType;
  }

  export interface ShortMove {
    from: Square;
    to: Square;
    promotion?: string;
  }

  export interface SloppyOption {
    sloppy?: boolean;
  }

  export class Chess {
    constructor(fen?: string);
    board(): (Piece | null)[][];
    fen(): string;
    turn(): Color;
    get(square: Square): Piece | null;
    move(move: string | ShortMove, options?: SloppyOption): Move | null;
    moves(): string[];
    moves(options: { verbose: true; square?: Square }): Move[];
    moves(options: { verbose?: false; square?: Square }): string[];
    undo(): Move | null;
    in_check(): boolean;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_draw(): boolean;
    insufficient_material(): boolean;
    in_threefold_repetition(): boolean;
    game_over(): boolean;
    load_pgn(pgn: string, options?: SloppyOption & { newline_char?: string }): boolean;
    /** Sem argumentos lê os cabeçalhos; com pares chave/valor, grava. Devolve sempre o objeto de cabeçalhos. */
    header(...pairs: string[]): Record<string, string>;
    history(): string[];
    history(options: { verbose: true }): Move[];
    pgn(options?: { max_width?: number; newline_char?: string }): string;
  }
}
