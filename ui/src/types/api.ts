// Contrato com o app desktop (window.lanceDesktop, em desktop/preload.js) e com a API (api/), do jeito que a
// página usa. Cada ponte é um IPC: o processo principal responde {ok: true, ...dados da API} ou
// {ok: false, status, error} (status 0 = sem conexão ou origem inválida; 422 = recusado antes de ir à API).

export interface IpcFail {
  ok: false;
  status: number;
  error?: string;
}
export type IpcResult<T> = ({ ok: true } & T) | IpcFail;

export type RoleSlug = 'administrador' | 'jogador' | (string & {});

/** Usuário como a API devolve (src/user-store.mjs → publicUser). id é o uuid. */
export interface ApiUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: RoleSlug;
  role_name?: string;
  active: boolean;
  forbidden: boolean;
  created_at: string;
  updated_at?: string;
}
export interface ApiRole {
  slug: RoleSlug;
  name: string;
}

/** Lance guardado na API (games.moves). cls usa os valores da API ("chance_perdida"). */
export interface ApiMove {
  uci: string;
  san: string | null;
  cls: string | null;
}
export type ApiGameStatus = 'em_andamento' | 'concluida' | 'abandonada';
export type ApiResult = '1-0' | '0-1' | '1/2-1/2';

/** meta da partida: dados da tela gravados pela página (apiBody). */
export interface ApiGameMeta {
  view?: 'play' | 'review';
  orient?: 'w' | 'b';
  headers?: Record<string, string>;
  result_text?: string | null;
  local_result?: string | null;
  ended?: boolean;
  resigned?: boolean;
}

/** Partida como a API devolve (src/games.mjs → publicGame). Na listagem vem sem moves/pgn/start_fen. */
export interface ApiGame {
  id: string;
  client_ref: string | null;
  white_user_id?: string | null;
  black_user_id?: string | null;
  color: 'w' | 'b' | null;
  opponent_type?: 'bot' | 'humano' | 'analise';
  bot_level: string | null;
  mode: 'normal' | 'assistido';
  status: ApiGameStatus;
  result: ApiResult | null;
  result_reason: string | null;
  outcome: 'vitoria' | 'derrota' | 'empate' | null;
  opening_name: string | null;
  ply_count: number;
  rated: boolean;
  rating_delta: number | null;
  /** pontuação pelo Stockfish no servidor: 'pending' até a análise terminar; null = não vale ou é de antes */
  rating_status?: 'pending' | 'applied' | 'failed' | null;
  /** precisão do jogador (0–100) medida pelo Stockfish do servidor */
  player_accuracy?: number | null;
  meta: ApiGameMeta | null;
  started_at: string;
  finished_at?: string | null;
  created_at?: string;
  updated_at: string;
  start_fen?: string | null;
  pgn?: string | null;
  moves?: ApiMove[];
}

/** Corpo de POST/PATCH /v1/games montado por apiBody (o processo principal só repassa os campos conhecidos). */
export interface ApiGameBody {
  moves: ApiMove[];
  pgn: string | null;
  opening_name: string | null;
  status: 'concluida' | 'em_andamento';
  result: string | null;
  result_reason: string | null;
  meta: Required<Omit<ApiGameMeta, 'headers'>> & { headers: Record<string, string> };
  mode?: 'normal' | 'assistido';
  rated?: boolean;
  client_ref?: string;
  opponent_type?: 'bot' | 'analise';
  bot_level?: string | null;
  color?: 'w' | 'b';
  start_fen?: string | null;
  started_at?: string;
}

/** Mudança de pontuação de uma partida. status 'pending': a API ainda está analisando (before = after = atual,
    delta 0); 'applied': o valor real, com a precisão e o Elo do bot usados; 'failed': não deu para calcular. */
export interface RatingChange {
  status?: 'pending' | 'applied' | 'failed';
  before: number;
  after: number;
  delta: number;
  accuracy?: number | null;
  bot_elo?: number | null;
  expected_score?: number | null;
  engine_version?: string | null;
}
/** Resposta de GET /v1/games/:id/rating (games:rating). */
export interface GameRatingData {
  game_id: string;
  rating_status: 'pending' | 'applied' | 'failed' | null;
  rating_change: RatingChange | null;
  rating: number | null;
}
/** Resposta de games:create / games:update. */
export interface GameSaveData {
  game: ApiGame;
  rating_change: RatingChange | null;
  rating: number;
}

export interface MoveStat {
  total: number;
  avg: number;
}
/** /v1/stats/me (src/stats.mjs → statsOf). moves tem uma chave por coluna de player_stats (book_moves…blunders). */
export interface PlayerStats {
  user_id: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  games_classified: number;
  total_moves: number;
  avg_moves: number;
  moves: Record<string, MoveStat>;
  /** precisão média pelo Stockfish nas partidas que valeram pontos (desde a pontuação pelo Stockfish) */
  accuracy?: { games: number; avg: number | null };
  updated_at?: string;
}
export interface RatingPoint {
  at: string;
  rating: number;
  delta: number;
  games: number;
  reason?: string | null;
  /** precisão do jogador na partida (pontuação pelo Stockfish); null nos pontos antigos */
  accuracy?: number | null;
  bot_elo?: number | null;
  game_id?: string | null;
}
export interface RatingHistoryData {
  points: RatingPoint[];
  start_rating: number;
  current_rating: number;
  from: string | null;
  to: string | null;
  group: string | null;
}

/** Mensagem no formato de chat com ferramentas (OpenAI/DeepSeek), usado pela API do tutor. */
export interface ToolCall {
  id: string;
  type?: 'function';
  function: { name: string; arguments?: string };
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}
export interface AiStatus {
  reachable: boolean;
  ai?: { ready?: boolean } | null;
}
export type AiChatResult = { ok: true; message?: ChatMessage; finish?: string; provider?: string; providerName?: string } | IpcFail;

export interface LanceDesktop {
  ai?: {
    provider: string;
    status(): Promise<AiStatus>;
    chat(payload: { messages: ChatMessage[]; tools: ChatTool[] }): Promise<AiChatResult>;
  };
  auth?: {
    login(data: { email: string; password: string }): Promise<IpcResult<{ user: ApiUser; legacyId?: string }>>;
    register(data: {
      first_name: string;
      last_name: string;
      email: string;
      password: string;
    }): Promise<IpcResult<{ user: ApiUser; legacyId?: string }>>;
    me(): Promise<IpcResult<{ user: ApiUser; offline?: boolean }>>;
    logout(): Promise<{ ok: boolean }>;
    updateMe(data: Record<string, string>): Promise<IpcResult<{ user: ApiUser; passwordChanged: boolean }>>;
    onExpired(cb: (info: { message?: string }) => void): void;
  };
  admin?: {
    listUsers(params: {
      q: string;
      limit: number;
      offset: number;
    }): Promise<IpcResult<{ users: ApiUser[]; total: number; limit: number; offset: number }>>;
    getUser(id: string): Promise<IpcResult<{ user: ApiUser }>>;
    createUser(data: Record<string, string | boolean>): Promise<IpcResult<{ user: ApiUser }>>;
    updateUser(id: string, data: Record<string, string | boolean>): Promise<IpcResult<{ user: ApiUser }>>;
    deleteUser(id: string): Promise<IpcResult<{ deleted: ApiUser }>>;
    listRoles(): Promise<IpcResult<{ roles: ApiRole[] }>>;
  };
  games?: {
    create(data: ApiGameBody): Promise<IpcResult<GameSaveData>>;
    update(id: string, data: Partial<ApiGameBody>): Promise<IpcResult<GameSaveData>>;
    list(params: {
      status?: string;
      limit: number;
      offset: number;
    }): Promise<IpcResult<{ games: ApiGame[]; total: number; limit: number; offset: number }>>;
    get(id: string): Promise<IpcResult<{ game: ApiGame }>>;
    remove(id: string): Promise<IpcResult<{ deleted?: unknown }>>;
    /** estado da pontuação calculada pela API (app desktop a partir desta versão) */
    rating?(id: string): Promise<IpcResult<GameRatingData>>;
  };
  stats?: {
    me(params?: Record<string, string>): Promise<IpcResult<{ stats: PlayerStats }>>;
    ratingHistory(params: { tz: number; from?: string; group?: string }): Promise<IpcResult<RatingHistoryData>>;
  };
}
