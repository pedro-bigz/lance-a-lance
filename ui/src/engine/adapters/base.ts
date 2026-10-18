/* ---------- Adaptador do Stockfish (contrato único de todas as versões) ----------
   O resto do app (análise, classificação, bot, estudo, tutor, demonstrações) fala só com StockfishAdapter e não sabe
   qual versão está rodando. A lógica comum fica aqui: worker, troca de candidato, timeout, fila de pedidos, leitura
   das linhas UCI e a busca em analyse(). Cada versão é uma subclasse (sf10.ts, sf19-lite.ts) que declara os próprios
   arquivos, candidatos, capacidades, níveis do bot e calibração e sobrescreve só os ganchos que mudam (Template
   Method): initCommands(), parseInfo()/parseExtra()/isPvToken(), parseBestmove(), strengthCommands().
   Sem DOM nem React no topo do módulo: vite.config.ts importa o registro para saber quais arquivos copiar. */
import type { BotId } from '../../core/constants';
import type { EngineLine, EngineResult } from '../../core/types';

/** wasm = WebAssembly (precisa de WebAssembly.instantiateStreaming e do .wasm como application/wasm); asm = só JavaScript */
export type EngineKind = 'wasm' | 'asm';
/** um jeito de subir o motor: o .js do worker e, no wasm, o .wasm que ele carrega (nomes relativos à pasta) */
export interface EngineCandidate {
  kind: EngineKind;
  script: string;
  wasm?: string;
}
/** candidato resolvido para um endereço (local ou CDN) */
export interface EngineSource {
  /** "wasm (local)", "asm (local)", "wasm (unpkg.com)"… */
  label: string;
  kind: EngineKind;
  /** endereço do worker; no wasm, o do .wasm vai no hash ("#" + URL codificada) */
  url: string;
  /** endereço do .js (o worker de Blob faz importScripts dele) */
  script: string;
  /** true: arquivo de outra origem, o worker é um Blob com importScripts */
  blob: boolean;
}
export interface EngineCapabilities {
  multiPvMax: number;
  /** "Skill Level" de 0 a 20 */
  skillLevel: boolean;
  /** UCI_LimitStrength/UCI_Elo e a faixa aceita; null se a versão não tem */
  limitStrength: { min: number; max: number } | null;
  /** WDL (UCI_ShowWDL) disponível */
  wdl: boolean;
}
/** como um nível do bot pede o lance a esta versão */
export interface BotSearch {
  skill: number;
  depth: number;
  movetime: number;
  /** chance de um lance aleatório em vez do motor (os níveis baixos erram de propósito) */
  random: number;
  /** UCI_Elo (só se a versão tiver UCI_LimitStrength) */
  elo?: number;
}
/** parâmetros da classificação que dependem do motor */
export interface Calibration {
  /** inclinação da curva centipeões → chance de vitória (wpCp em core/eval.ts) */
  wpK: number;
}
export interface AnalyseOpts {
  depth?: number;
  movetime?: number;
  multipv?: number;
  skill?: number;
  /** força limitada por Elo (UCI_LimitStrength); sem isso, força total */
  elo?: number;
  /** pedido que ficou velho antes de começar: resolve null sem rodar */
  isStale?: () => boolean;
}
/** o que o build e o app desktop precisam saber da versão (vira dist/engine.json) */
export interface EngineManifest {
  id: string;
  label: string;
  version: string;
  files: string[];
}

/** cria o worker de um candidato; probe (opcional) confere antes se vale a pena tentar (false = pula na hora) */
export type WorkerFactory = (() => Worker) & { label?: string; probe?: () => Promise<boolean> };
type LineHandler = (line: string) => void;

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
/** curva da chance de vitória usada desde a primeira versão (a mesma do Lichess) */
export const DEFAULT_WP_K = 0.00368208;
/** tempo para um candidato responder "uciok" e "readyok" antes de passar ao próximo */
export const BOOT_TIMEOUT = 30000;

/** O navegador compila WebAssembly por streaming? (os builds wasm do stockfish.js só usam esse caminho) */
export function wasmSupported(g: { WebAssembly?: unknown } = globalThis): boolean {
  const W = g.WebAssembly as { instantiateStreaming?: unknown } | undefined;
  return !!W && typeof W.instantiateStreaming === 'function';
}

export abstract class StockfishAdapter {
  /** id do registro, da variável VITE_STOCKFISH e da pasta engines/<id>/ */
  abstract readonly id: string;
  /** nome para gente: "Stockfish 19 (lite)" */
  abstract readonly label: string;
  /** versão do pacote npm "stockfish" de onde vieram os arquivos */
  abstract readonly version: string;
  /** candidatos em ordem de preferência (nomes dos arquivos em engines/<id>/) */
  abstract readonly candidates: readonly EngineCandidate[];
  /** pastas de CDN com os mesmos arquivos (reserva final, depois das cópias locais) */
  abstract readonly cdn: readonly string[];
  abstract readonly capabilities: EngineCapabilities;
  /** níveis do bot nesta versão (BOTS em core/constants.ts tem só nome, Elo e descrição) */
  abstract readonly botLevels: Readonly<Record<Exclude<BotId, 'none'>, BotSearch>>;
  readonly calibration: Calibration = { wpK: DEFAULT_WP_K };
  /** arquivos extras que vão junto (licença) */
  readonly extraFiles: readonly string[] = ['STOCKFISH-LICENSE.txt'];

  /** todos os arquivos da versão: copiados de engines/<id>/ para dist/ (e para desktop/app/) */
  get files(): string[] {
    const out = new Set<string>();
    for (const c of this.candidates) {
      out.add(c.script);
      if (c.wasm) out.add(c.wasm);
    }
    for (const f of this.extraFiles) out.add(f);
    return [...out];
  }
  manifest(): EngineManifest {
    return { id: this.id, label: this.label, version: this.version, files: this.files };
  }

  // ---------- ganchos (as subclasses sobrescrevem o que muda) ----------

  /** comandos depois do "uciok" (opções que a versão aceita) */
  initCommands(): string[] {
    return ['setoption name Hash value 32'];
  }
  /** comandos de força antes de cada busca: Skill Level e, se a versão tiver, UCI_LimitStrength/UCI_Elo */
  strengthCommands(skill: number, elo?: number): [string, string | number][] {
    const out: [string, string | number][] = [];
    if (this.capabilities.skillLevel) out.push(['Skill Level', skill]);
    const ls = this.capabilities.limitStrength;
    if (ls) {
      const on = elo != null;
      out.push(['UCI_LimitStrength', on ? 'true' : 'false']);
      if (on) out.push(['UCI_Elo', Math.max(ls.min, Math.min(ls.max, Math.round(elo)))]);
    }
    return out;
  }
  /** item da variante principal? (a variante vai até o primeiro item que não é lance) */
  isPvToken(t: string): boolean {
    return UCI_MOVE.test(t);
  }
  /** campos opcionais da linha (ex.: wdl); recebe os itens e o índice de "score" */
  parseExtra(t: string[], _scoreAt: number): Partial<EngineLine> {
    const w = t.indexOf('wdl');
    if (w < 0) return {};
    const wdl = [t[w + 1], t[w + 2], t[w + 3]].map((x) => parseInt(x as string, 10));
    return wdl.every((x) => Number.isFinite(x)) ? { wdl: wdl as [number, number, number] } : {};
  }
  /** Lê uma linha "info … score cp|mate N … pv …" (null se não tiver nota e variante, ou se a nota for só um limite). */
  parseInfo(l: string): EngineLine | null {
    const t = l.split(' ');
    const i = t.indexOf('score');
    const p = t.indexOf('pv');
    if (t[0] !== 'info' || i < 0 || p < 0) return null;
    if (t[i + 3] === 'lowerbound' || t[i + 3] === 'upperbound') return null;
    const v = parseInt(t[i + 2] as string, 10);
    if (Number.isNaN(v)) return null;
    const pv: string[] = [];
    for (const m of t.slice(p + 1)) {
      if (!this.isPvToken(m)) break;
      pv.push(m);
    }
    if (!pv.length) return null;
    const mi = t.indexOf('multipv'),
      di = t.indexOf('depth');
    return {
      multipv: mi > 0 ? +(t[mi + 1] as string) : 1,
      depth: di > 0 ? +(t[di + 1] as string) : 0,
      score: t[i + 1] === 'mate' ? { mate: v } : { cp: v },
      pv,
      ...this.parseExtra(t, i),
    };
  }
  /** "bestmove e2e4 ponder e7e5" → "e2e4"; "(none)" (sem lance legal) → null */
  parseBestmove(l: string): string | null {
    const m = l.split(' ')[1];
    return m && m !== '(none)' ? m : null;
  }
  /** opções de busca de um nível do bot */
  botSearch(id: Exclude<BotId, 'none'>): BotSearch {
    return this.botLevels[id];
  }

  // ---------- candidatos ----------

  /** Ordem de tentativa: os candidatos na pasta da página, depois em cada CDN. Sem WebAssembly, só os asm. */
  sources(base: string, wasm = true): EngineSource[] {
    const list: EngineSource[] = [];
    const add = (dir: string, where: string, blob: boolean) => {
      for (const c of this.candidates) {
        if (c.kind === 'wasm' && !wasm) continue;
        const script = new URL(c.script, dir).href;
        const url = c.wasm ? `${script}#${encodeURIComponent(new URL(c.wasm, dir).href)}` : script;
        list.push({ label: `${c.kind} (${where})`, kind: c.kind, url, script, blob });
      }
    };
    add(base, 'local', false);
    for (const c of this.cdn) add(c, new URL(c).host, true);
    return list;
  }
  /** Antes de subir um wasm, confere o .wasm (HEAD): o stockfish.js não avisa quando ele falta ou vem com outro
      MIME (a promessa rejeitada morre dentro do worker, sem evento de erro) e o boot só desistiria no timeout. */
  async probeWasm(url: string): Promise<boolean> {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      return r.ok && (r.headers.get('content-type') || '').includes('application/wasm');
    } catch (_) {
      return false;
    }
  }
  /** worker de um candidato (o de CDN é um Blob com importScripts; o hash com o endereço do .wasm vai junto) */
  workerFactory(s: EngineSource): WorkerFactory {
    const make: WorkerFactory = s.blob
      ? () => {
          const hash = s.url.includes('#') ? s.url.slice(s.url.indexOf('#')) : '';
          const blob = new Blob([`importScripts(${JSON.stringify(s.script)});`], { type: 'text/javascript' });
          return new Worker(URL.createObjectURL(blob) + hash);
        }
      : () => new Worker(s.url);
    make.label = s.label;
    const hash = s.url.indexOf('#');
    if (s.kind === 'wasm' && hash >= 0) {
      const wasm = decodeURIComponent(s.url.slice(hash + 1));
      make.probe = () => this.probeWasm(wasm);
    }
    return make;
  }
  workerCandidates(): WorkerFactory[] {
    return this.sources(document.baseURI, wasmSupported()).map((s) => this.workerFactory(s));
  }

  // ---------- worker, fila e busca (comum a todas as versões) ----------

  handlers = new Set<LineHandler>();
  opts: Record<string, string | number> = {};
  chain: Promise<unknown> = Promise.resolve();
  ready: Promise<void>;
  /** sobe o worker (uma vez); no app desktop só depois do login */
  start!: () => Promise<void>;
  started = false;
  w: Worker | null = null;
  /** candidato que subiu ("wasm (local)", "asm (local)"…) e o nome que o motor informou ("id name …") */
  source: string | null = null;
  name: string | null = null;

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.start = () => {
        if (!this.started) {
          this.started = true;
          this.boot(this.workerCandidates()).then(resolve, reject);
        }
        return this.ready;
      };
    });
    // sem start() ninguém espera o ready; não vira "unhandled rejection"
    this.ready.catch(() => {});
  }
  boot(cands: WorkerFactory[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const next = async () => {
        const make = cands.shift();
        if (!make) {
          reject(new Error('Stockfish indisponível'));
          return;
        }
        if (make.probe && !(await make.probe())) {
          void next();
          return;
        }
        let w: Worker | undefined,
          settled = false;
        // declarado antes de fail(): se new Worker() lançar na hora, fail() roda antes do setTimeout abaixo
        let timer: ReturnType<typeof setTimeout> | undefined = undefined;
        const fail = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try {
            if (w) w.terminate();
          } catch (_) {}
          this.handlers.clear();
          this.opts = {};
          void next();
        };
        try {
          w = make();
        } catch (e) {
          fail();
          return;
        }
        const worker = w;
        this.w = worker;
        // o .wasm que não carrega (MIME errado, 404, CSP) vira um erro do worker: passa para o próximo candidato
        worker.onerror = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          fail();
        };
        worker.onmessage = (e) => {
          // (os builds novos também mandam objetos de progresso do download; só texto é UCI)
          if (typeof e.data !== 'string') return;
          for (const h of [...this.handlers]) h(e.data);
        };
        timer = setTimeout(fail, BOOT_TIMEOUT);
        this.waitFor(
          (l) => l === 'uciok',
          (l) => {
            if (l.startsWith('id name ')) this.name = l.slice(8);
          },
        )
          .then(() => {
            for (const c of this.initCommands()) this.send(c);
            return this.sync();
          })
          .then(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.onerror = null;
            this.source = make.label ?? null;
            resolve();
          });
        this.send('uci');
      };
      void next();
    });
  }
  send(c: string): void {
    (this.w as Worker).postMessage(c);
  }
  waitFor(pred: (l: string) => boolean, onLine?: LineHandler): Promise<string> {
    return new Promise((res) => {
      const h = (l: string) => {
        if (onLine) onLine(l);
        if (pred(l)) {
          this.handlers.delete(h);
          res(l);
        }
      };
      this.handlers.add(h);
    });
  }
  sync(): Promise<string> {
    const p = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    return p;
  }
  setOpt(name: string, val: string | number): void {
    if (this.opts[name] === val) return;
    this.opts[name] = val;
    this.send(`setoption name ${name} value ${val}`);
  }
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(() => this.ready).then(fn);
    this.chain = p.catch(() => {});
    return p;
  }
  analyse(fen: string, { depth = 15, movetime = 1500, multipv = 1, skill = 20, elo, isStale }: AnalyseOpts = {}): Promise<EngineResult | null> {
    return this.run(async () => {
      if (isStale && isStale()) return null;
      for (const [k, v] of this.strengthCommands(skill, elo)) this.setOpt(k, v);
      this.setOpt('MultiPV', Math.min(multipv, this.capabilities.multiPvMax));
      await this.sync();
      const byDepth: Record<number, EngineLine[]> = {};
      this.send('position fen ' + fen);
      const done = this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (l.startsWith('info')) {
            const r = this.parseInfo(l);
            if (r) (byDepth[r.depth] = byDepth[r.depth] || [])[r.multipv - 1] = r;
          }
        },
      );
      this.send(`go depth ${depth} movetime ${movetime}`);
      const bm = this.parseBestmove(await done);
      // usa a profundidade mais alta em que todas as linhas pedidas ficaram completas
      const depths = Object.keys(byDepth)
        .map(Number)
        .sort((x, y) => y - x);
      const full = depths.find((d) => (byDepth[d] as EngineLine[]).filter(Boolean).length >= multipv);
      const lines = depths.length ? (byDepth[full != null ? full : (depths[0] as number)] as EngineLine[]).filter(Boolean) : [];
      const best = (lines[0] && lines[0].pv[0]) || bm;
      return { lines, best, bestmove: bm };
    });
  }
}
