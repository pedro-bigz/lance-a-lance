/* ---------- Tutor de aberturas com IA ----------
   No app desktop o tutor usa a API do tutor (pasta api/), que guarda as chaves e escolhe a IA: Gemini primeiro,
   DeepSeek se o Gemini falhar ou ficar sem crédito, OpenRouter por último. O app não tem chave nenhuma.
   No artifact do claude.ai o navegador bloqueia outros servidores, então lá ele usa o Claude da própria conta
   (capacidade "sample": window.claude.use('sample')). As ferramentas agem no tabuleiro.
   O estado da conversa fica em TUTOR (mensagens, ocupado, disponível); o desenho é TutorPanel (tutor/tutor-panel.tsx). */
import { findLines, openingAt, openingNameOfLines, pgnOf, pickVariety, validLine, type BookLine } from '../book/index';
import { BOTS, type Bot } from '../core/constants';
import { S, botColor } from '../core/state';
import { norm } from '../book/index';
import { DESKTOP_AI } from '../desktop/bridge';
import { RATING } from '../game/rating';
import { REFS, UI } from '../game/ui-state';
import { setStudy } from '../study/panel';
import { publish } from '../store/view-store';
import type { ChatMessage, ChatTool } from '../types/api';
import type { ClaudeSample, SampleMessage, SampleTool } from '../types/globals';
import { buildDemo, playDemo, startTraining } from './training';

const levelBot = (n: string): Bot | null => BOTS.find((b) => b.id === n) || BOTS.find((b) => norm(b.level) === norm(n)) || null;

function gameSummary() {
  const sans = S.plies.map((p) => p.san);
  return {
    modo: S.mode === 'review' ? 'revisão/demonstração' : botColor() ? 'partida contra bot' : 'tabuleiro livre',
    usuario_joga_de: S.mode === 'play' && botColor() ? (S.player === 'w' ? 'brancas' : 'pretas') : null,
    bot: S.mode === 'play' && botColor() ? `${S.bot.level} (≈${S.bot.elo})` : null,
    lances: pgnOf(sans).slice(-900),
    fen: S.positions[S.positions.length - 1],
    vez: S.game.turn() === 'w' ? 'brancas' : 'pretas',
    abertura: openingAt(S.positions, S.positions.length - 1),
    lances_de_livro: S.bookLen || 0,
    fim: S.over || null,
    treino: S.trainer ? { abertura: S.trainer.name, ativo: !S.trainer.done } : null,
    rating_do_usuario: RATING.rating,
  };
}
// entrada das ferramentas: JSON vindo da IA, conferido campo a campo
type ToolInput = Record<string, unknown>;
const TUTOR_TOOLS: SampleTool[] = [
  {
    name: 'buscar_aberturas',
    description:
      'Procura aberturas e variantes no livro do app (cerca de 3.900 linhas com nome). Retorna até 12 linhas {nome, lances}. Use antes de treinar ou demonstrar para escolher variantes reais.',
    inputSchema: {
      type: 'object',
      properties: { consulta: { type: 'string', description: 'Nome ou parte do nome, ex.: "italiana", "siciliana najdorf", "gambito evans"' } },
      required: ['consulta'],
    },
    execute(input: ToolInput) {
      tutorStatus('Procurando no livro de aberturas…');
      const list = pickVariety(findLines(input.consulta as string), 12);
      if (!list.length) throw new Error('nenhuma linha encontrada; tente outro nome');
      return list.map((l) => ({ nome: l.name, lances: pgnOf(l.sans) }));
    },
  },
  {
    name: 'treinar_abertura',
    description:
      'Começa uma partida de treino no tabuleiro: o bot segue as linhas da abertura (escolhe entre as variantes) enquanto o usuário seguir a teoria e depois joga pelo motor. Use cor_usuario igual ao lado que joga a abertura para o usuário praticá-la (o bot se defende), ou o lado contrário para o usuário enfrentá-la. Retorna o que foi iniciado.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Abertura/variante a treinar (busca no livro), ex.: "italiana"' },
        lances: {
          type: 'array',
          items: { type: 'string' },
          description: 'Opcional: uma linha específica em SAN, ex.: ["e4","e5","Nf3","Nc6","Bc4"]',
        },
        cor_usuario: { type: 'string', enum: ['brancas', 'pretas'] },
        nivel: { type: 'string', description: 'Opcional: novato, iniciante, intermediario, avancado, mestre ou gm' },
      },
      required: ['cor_usuario'],
    },
    execute(input: ToolInput) {
      let lines: BookLine[] = [];
      if (Array.isArray(input.lances) && input.lances.length) {
        const v = validLine(input.lances);
        if (v.length) lines = [{ name: (input.consulta as string) || 'linha escolhida', sans: v }];
      }
      if (!lines.length && input.consulta) lines = findLines(input.consulta as string);
      if (!lines.length) throw new Error('não achei linhas para essa abertura; use buscar_aberturas primeiro');
      const name = input.consulta ? openingNameOfLines(lines) || (input.consulta as string) : (lines[0] as BookLine).name;
      const userColor = /pret/i.test(String(input.cor_usuario)) ? 'b' : 'w';
      startTraining({ lines, name, userColor, bot: input.nivel ? levelBot(String(input.nivel)) : null });
      tutorStatus('Partida de treino começou no tabuleiro.');
      return {
        iniciada: true,
        abertura: name,
        variantes_disponiveis: lines.length,
        usuario_joga_de: userColor === 'w' ? 'brancas' : 'pretas',
        bot: `${S.bot.level} (≈${S.bot.elo})`,
        vale_rating: false,
      };
    },
  },
  {
    name: 'demonstrar_partida',
    description:
      'Mostra no tabuleiro uma ou mais partidas de exemplo bot contra bot: cada uma segue uma variante da abertura e continua alguns lances pelo motor, com reprodução automática lance a lance. Retorna as variantes que serão mostradas.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Abertura/variante, ex.: "italiana giuoco piano"' },
        lances: { type: 'array', items: { type: 'string' }, description: 'Opcional: linha específica em SAN' },
        variantes: { type: 'number', description: 'Quantas variantes diferentes mostrar em sequência (1 a 3). Padrão 1.' },
        lances_extras: { type: 'number', description: 'Meios-lances do motor depois da linha (0 a 20). Padrão 8.' },
      },
    },
    async execute(input: ToolInput, ctx: { signal: AbortSignal }) {
      let lines: BookLine[] = [];
      if (Array.isArray(input.lances) && input.lances.length) {
        const v = validLine(input.lances);
        if (v.length) lines = [{ name: (input.consulta as string) || 'linha escolhida', sans: v }];
      }
      if (!lines.length && input.consulta)
        lines = pickVariety(findLines(input.consulta as string), Math.max(1, Math.min(3, Number(input.variantes) || 1)));
      if (!lines.length) throw new Error('não achei linhas para essa abertura; use buscar_aberturas primeiro');
      const extra = Math.max(0, Math.min(20, input.lances_extras == null ? 8 : Number(input.lances_extras) || 0));
      const demos = [];
      for (const l of lines) {
        if (ctx.signal.aborted) break;
        tutorStatus(`Preparando a demonstração ${demos.length + 1} de ${lines.length}…`);
        demos.push(await buildDemo(l, extra));
      }
      if (ctx.signal.aborted || !demos.length) throw new Error('cancelado');
      S.demoQueue = demos.slice(1);
      playDemo(demos[0]!);
      return demos.map((d) => ({ nome: d.name, lances: pgnOf(d.sans) }));
    },
  },
  {
    name: 'estado_do_tabuleiro',
    description:
      'Retorna o estado atual do app: modo, lances jogados (PGN), FEN, vez de quem, abertura reconhecida, lances de livro, treino ativo e rating do usuário. Use para comentar a partida que está no tabuleiro.',
    execute() {
      return gameSummary();
    },
  },
];
const TUTOR_RULES = `Você é o tutor de xadrez do app "Lance a Lance" e ajuda o usuário a estudar aberturas e estratégias. Responda em português do Brasil, de forma curta e didática (no máximo 3 parágrafos curtos ou uma lista), explicando ideias, planos e armadilhas típicas.
Você controla o tabuleiro pelas ferramentas:
- buscar_aberturas: encontra variantes reais no livro do app. Use antes de citar lances específicos.
- treinar_abertura: começa uma partida de treino. Se o usuário quer APRENDER/PRATICAR a abertura jogando com ela, ele joga do lado que faz a abertura (ex.: Italiana = brancas) e o bot se defende com as respostas teóricas. Se ele quer aprender a ENFRENTAR/se defender dela, ele joga do outro lado e o bot joga a abertura. Se não der para saber, escolha a primeira opção e diga que dá para inverter.
- demonstrar_partida: mostra partidas de exemplo bot contra bot no tabuleiro (até 3 variantes seguidas).
- estado_do_tabuleiro: lê a partida atual para comentar lances e posições.
Use as ferramentas quando o pedido envolver o tabuleiro; não invente lances que o livro não tenha. Depois de agir, diga em uma frase o que está acontecendo no tabuleiro e o que o usuário deve observar.`;

/** Mensagem do log do tutor: note é texto simples; user e assistant aceitam **negrito** e quebras de linha. */
export interface TutorMsg {
  id: number;
  role: 'user' | 'assistant' | 'note';
  text: string;
  pending?: boolean;
  unavail?: boolean;
}
export interface TutorState {
  turns: SampleMessage[];
  busy: boolean;
  ctl: AbortController | null;
  /** sample: undefined = ainda não pedido; null = indisponível */
  sample: ClaudeSample | null | undefined;
  greeted?: boolean;
  log: TutorMsg[];
  /** muda quando o log deve rolar até o fim (mensagem nova ou texto chegando) */
  scroll: number;
  /** desktop: API do tutor no ar e com IA configurada (null = ainda não conferido) */
  ready: boolean | null;
  apiMsg: string;
  sub: string;
  status: string;
}
export const TUTOR: TutorState = {
  turns: [],
  busy: false,
  ctl: null,
  sample: undefined,
  log: [],
  scroll: 0,
  ready: null,
  apiMsg: '',
  sub: 'treinos, exemplos e explicações',
  status: '',
};
let msgSeq = 0;
const AI_NAME = DESKTOP_AI ? 'IA' : 'Claude';
const DS_TOOLS: ChatTool[] = TUTOR_TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: 'object', properties: {} } },
}));
/** erro do tutor (lançado por apiAnswer ou pela capacidade "sample" do artifact) */
interface TutorError {
  code?: string;
  text?: string;
  status?: number;
  message?: string;
}
async function apiAnswer(turns: SampleMessage[], context: string, bubble: TutorMsg, signal: AbortSignal): Promise<string> {
  const ai = DESKTOP_AI!;
  const messages: ChatMessage[] = [{ role: 'system', content: TUTOR_RULES + context }, ...turns];
  let shown = '';
  for (let round = 0; round < 6; round++) {
    if (signal.aborted) throw { code: 'cancelled' } as TutorError;
    const r = await ai.chat({ messages, tools: round < 5 ? DS_TOOLS : [] });
    if (signal.aborted) throw { code: 'cancelled', text: shown } as TutorError;
    if (!r || !r.ok) throw { code: 'api', status: r && r.status, message: r && r.error, text: shown } as TutorError;
    if (r.providerName) showTutorProvider(r.providerName);
    const msg: ChatMessage = r.message || { role: 'assistant', content: '' };
    messages.push({ role: 'assistant', content: msg.content || '', ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) {
      shown = (shown ? shown + '\n\n' : '') + msg.content;
      setMsg(bubble, shown);
    }
    if (!msg.tool_calls || !msg.tool_calls.length) return shown || 'Pronto.';
    for (const tc of msg.tool_calls) {
      const tool = TUTOR_TOOLS.find((t) => t.name === (tc.function && tc.function.name));
      let out: unknown;
      try {
        if (!tool) throw new Error('ferramenta desconhecida');
        let args: ToolInput = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch (_) {}
        out = await tool.execute(args, { signal });
      } catch (e) {
        out = 'Erro: ' + ((e && (e as Error).message) || e);
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: (typeof out === 'string' ? out : JSON.stringify(out)).slice(0, 20000) });
    }
  }
  return shown || 'Pronto.';
}
// mostra no subtítulo qual IA respondeu por último (a API troca de provedor sozinha)
function showTutorProvider(name: string): void {
  TUTOR.sub = `respondido por ${name} · treinos, exemplos e explicações`;
  publish('board');
}
// verifica se a API do tutor está no ar e com pelo menos uma chave de IA configurada
async function refreshKeyUi(): Promise<boolean> {
  if (!DESKTOP_AI) return true;
  const st = await DESKTOP_AI.status().catch(() => ({ reachable: false, ai: null }));
  const ready = Boolean(st.reachable && st.ai && st.ai.ready);
  TUTOR.ready = ready;
  // mensagem genérica: detalhes de servidor e configuração não aparecem para o usuário
  if (!ready)
    TUTOR.apiMsg = !st.reachable
      ? 'Não foi possível conectar ao tutor. Confira sua internet e tente de novo.'
      : 'O tutor está indisponível no momento. Tente de novo mais tarde.';
  publish('board');
  return ready;
}
function tutorAdd(role: TutorMsg['role'], text: string, extra?: Partial<TutorMsg>, first?: boolean): TutorMsg {
  const m: TutorMsg = { id: ++msgSeq, role, text, ...extra };
  TUTOR.log = first ? [m, ...TUTOR.log] : [...TUTOR.log, m];
  TUTOR.scroll++;
  publish('board');
  return m;
}
/** troca o texto de uma mensagem (resposta chegando) e tira o "pensando" */
function setMsg(m: TutorMsg, text: string, scroll?: boolean): void {
  TUTOR.log = TUTOR.log.map((x) => (x.id === m.id ? { ...x, text, pending: false } : x));
  if (scroll) TUTOR.scroll++;
  publish('board');
}
function dropMsg(m: TutorMsg): void {
  TUTOR.log = TUTOR.log.filter((x) => x.id !== m.id);
  publish('board');
}
export function tutorNote(text: string): void {
  tutorAdd('note', text);
}
function tutorStatus(text: string): void {
  TUTOR.status = text;
  publish('board');
}
async function tutorSend(raw: string): Promise<void> {
  const text = String(raw || '').trim();
  if (!text || TUTOR.busy) return;
  if (DESKTOP_AI) {
    if (!(await refreshKeyUi())) return;
  } else {
    if (TUTOR.sample === undefined) TUTOR.sample = (await window.claude?.use?.('sample')?.catch(() => null)) || null;
    if (!TUTOR.sample) {
      tutorUnavailable();
      return;
    }
  }
  tutorAdd('user', text);
  TUTOR.turns.push({ role: 'user', content: text });
  TUTOR.turns = TUTOR.turns.slice(-14);
  if ((TUTOR.turns[0] as SampleMessage).role !== 'user') TUTOR.turns.shift();
  TUTOR.busy = true;
  TUTOR.ctl = new AbortController();
  const bubble = tutorAdd('assistant', 'Pensando…', { pending: true });
  const context = `\n\nEstado atual do app (JSON): ${JSON.stringify(gameSummary())}`;
  try {
    if (DESKTOP_AI) {
      const answer = await apiAnswer(TUTOR.turns, context, bubble, TUTOR.ctl.signal);
      setMsg(bubble, answer);
      TUTOR.turns.push({ role: 'assistant', content: answer });
      return;
    }
    const { text: answer } = await (TUTOR.sample as ClaudeSample)(
      [
        { role: 'user', content: TUTOR_RULES + context },
        { role: 'assistant', content: 'Entendido. Vou ajudar com as aberturas usando o tabuleiro quando fizer sentido.' },
        ...TUTOR.turns,
      ],
      {
        cache: false,
        signal: TUTOR.ctl.signal,
        tools: TUTOR_TOOLS,
        modelTier: 'default',
        onText: ({ text: t }) => setMsg(bubble, t, true),
      },
    );
    setMsg(bubble, answer);
    TUTOR.turns.push({ role: 'assistant', content: answer });
  } catch (e) {
    const err = e as TutorError | null | undefined;
    const partial = err && err.text;
    if (partial) setMsg(bubble, partial);
    else dropMsg(bubble);
    const code = err && err.code;
    if (
      code === 'not_granted' ||
      code === 'sampling_disabled' ||
      code === 'not_declared' ||
      code === 'capability_disabled' ||
      code === 'tools_unavailable'
    )
      tutorUnavailable(code);
    else if (code === 'api') {
      const st = (err as TutorError).status;
      tutorNote(
        st === 0
          ? 'Não foi possível conectar ao tutor. Confira sua internet e tente de novo.'
          : st === 401 || st === 403
            ? (err as TutorError).message || 'Sua sessão expirou. Entre de novo.'
            : st === 402 || st === 502 || st === 503
              ? 'O tutor está indisponível no momento. Tente de novo mais tarde.'
              : st === 429
                ? 'Muitas mensagens seguidas. Espere um minuto e tente de novo.'
                : 'O tutor não conseguiu responder. Tente de novo.',
      );
      if ([0, 503].includes(st as number)) refreshKeyUi();
    } else if (code === 'rate_limited') tutorNote('Limite de uso do Claude atingido por agora. Tente de novo daqui a pouco.');
    else if (code === 'session_expired') tutorNote('Sua sessão no Claude expirou. Entre de novo para continuar.');
    else if (code !== 'cancelled') tutorNote('Não consegui responder agora. Tente enviar de novo.');
  } finally {
    TUTOR.busy = false;
    TUTOR.ctl = null;
    tutorStatus('');
  }
}
function tutorUnavailable(code?: string): void {
  const msg =
    code === 'not_granted'
      ? 'O uso do Claude não foi permitido nesta página. Para usar o tutor, permita o acesso quando o pedido aparecer (ou no menu de permissões do artifact).'
      : 'O tutor de IA usa o Claude e funciona quando o Lance a Lance é aberto no claude.ai. Neste app ele ainda não está disponível.';
  if (!TUTOR.log.some((m) => m.unavail)) tutorAdd('note', msg, { unavail: true });
}
const GREETING =
  'Oi! Sou o tutor de aberturas. Diga o que você quer estudar, por exemplo **"quero aprender a Abertura Italiana"**. Eu posso montar um treino em que o bot joga a teoria, mostrar partidas de exemplo entre dois bots ou deixar você jogar a abertura enquanto o bot se defende.';
export function setTutor(open: boolean): void {
  if (open) setStudy(false); // o estudo de aberturas ocupa o mesmo canto da tela
  UI.tutor = open;
  TUTOR.sub = `com ${AI_NAME} · treinos, exemplos e explicações`;
  publish('board');
  if (open && DESKTOP_AI) {
    if (!TUTOR.greeted) {
      TUTOR.greeted = true;
      tutorAdd('assistant', GREETING);
    }
    refreshKeyUi().then((ok) => {
      if (ok && REFS.tutorIn) REFS.tutorIn.focus();
    });
    return;
  }
  if (open) {
    if (!TUTOR.greeted) {
      TUTOR.greeted = true;
      tutorAdd('assistant', GREETING, undefined, true); // a saudação fica no topo, antes dos avisos já dados
    }
    if (REFS.tutorIn) REFS.tutorIn.focus();
    if (TUTOR.sample === null) tutorUnavailable();
    else if (TUTOR.sample === undefined && window.claude?.use)
      window.claude.use('sample').then(
        (sm) => {
          TUTOR.sample = sm || null;
          if (!sm) tutorUnavailable();
        },
        () => {
          TUTOR.sample = null;
          tutorUnavailable();
        },
      );
  }
}
/** troca de contexto do tabuleiro: o tutor não continua agindo na partida do outro contexto */
export function abortTutor(): void {
  if (TUTOR.ctl) TUTOR.ctl.abort();
}
export const toggleTutor = (): void => setTutor(!UI.tutor);
/** envia o que está no campo (Enter ou botão Enviar) */
export function tutorSubmit(): void {
  const el = REFS.tutorIn;
  if (!el) return;
  const v = el.value;
  el.value = '';
  tutorSend(v);
}
export const tutorChip = (q: string): Promise<void> => tutorSend(q);
export const tutorStop = (): void => {
  if (TUTOR.ctl) TUTOR.ctl.abort();
};
/** "Tentar de novo" quando a API do tutor estava fora */
export async function tutorRetry(): Promise<void> {
  if (await refreshKeyUi()) {
    tutorNote('Tutor conectado.');
    if (REFS.tutorIn) REFS.tutorIn.focus();
  }
}
export function initTutor(): void {
  if (!window.claude && !DESKTOP_AI) TUTOR.sample = null;
}
