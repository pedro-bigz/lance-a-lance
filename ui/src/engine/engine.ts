/* ---------- Motor (Stockfish em Web Worker) ----------
   stockfish.asm.js fica ao lado da página (ui/public → dist). No app desktop o worker sobe do mesmo origin
   (app://lance); no artifact, se a cópia local falhar, tenta as CDNs permitidas por um Blob com importScripts. */
import type { EngineLine, EngineResult } from '../core/types';

const SF_LOCAL = 'stockfish.asm.js';
const SF_CDN = ['https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.asm.js', 'https://unpkg.com/stockfish@10.0.2/src/stockfish.asm.js'];

type WorkerFactory = () => Worker;
function workerCandidates(): WorkerFactory[] {
  const list: WorkerFactory[] = [() => new Worker(SF_LOCAL)];
  for (const url of SF_CDN)
    list.push(() => new Worker(URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(url)});`], { type: 'text/javascript' }))));
  return list;
}
export function parseInfo(l: string): EngineLine | null {
  const t = l.split(' ');
  const i = t.indexOf('score');
  const p = t.indexOf('pv');
  if (i < 0 || p < 0) return null;
  if (t[i + 3] === 'lowerbound' || t[i + 3] === 'upperbound') return null;
  const v = parseInt(t[i + 2] as string, 10);
  const mi = t.indexOf('multipv'),
    di = t.indexOf('depth');
  return {
    multipv: mi > 0 ? +(t[mi + 1] as string) : 1,
    depth: di > 0 ? +(t[di + 1] as string) : 0,
    score: t[i + 1] === 'mate' ? { mate: v } : { cp: v },
    pv: t.slice(p + 1),
  };
}

export interface AnalyseOpts {
  depth?: number;
  movetime?: number;
  multipv?: number;
  skill?: number;
  /** pedido que ficou velho antes de começar: resolve null sem rodar */
  isStale?: () => boolean;
}
type LineHandler = (line: string) => void;

export class Engine {
  handlers = new Set<LineHandler>();
  opts: Record<string, string | number> = {};
  chain: Promise<unknown> = Promise.resolve();
  ready: Promise<void>;
  /** sobe o worker (uma vez); no app desktop só depois do login */
  start!: () => Promise<void>;
  started = false;
  w: Worker | null = null;
  // o worker só sobe em start() (no app desktop, depois do login)
  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.start = () => {
        if (!this.started) {
          this.started = true;
          this.boot(workerCandidates()).then(resolve, reject);
        }
        return this.ready;
      };
    });
  }
  boot(cands: WorkerFactory[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const next = () => {
        const make = cands.shift();
        if (!make) {
          reject(new Error('Stockfish indisponível'));
          return;
        }
        let w: Worker | undefined,
          settled = false;
        const fail = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            if (w) w.terminate();
          } catch (_) {}
          this.handlers.clear();
          next();
        };
        try {
          w = make();
        } catch (e) {
          fail();
          return;
        }
        const worker = w;
        this.w = worker;
        worker.onerror = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          fail();
        };
        worker.onmessage = (e) => {
          const line = String(e.data);
          for (const h of [...this.handlers]) h(line);
        };
        const timer = setTimeout(fail, 30000);
        this.waitFor((l) => l === 'uciok')
          .then(() => {
            this.send('setoption name Hash value 32');
            this.send('setoption name Contempt value 0');
            return this.sync();
          })
          .then(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.onerror = null;
            resolve();
          });
        this.send('uci');
      };
      next();
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
  analyse(fen: string, { depth = 15, movetime = 1500, multipv = 1, skill = 20, isStale }: AnalyseOpts = {}): Promise<EngineResult | null> {
    return this.run(async () => {
      if (isStale && isStale()) return null;
      this.setOpt('Skill Level', skill);
      this.setOpt('MultiPV', multipv);
      await this.sync();
      const byDepth: Record<number, EngineLine[]> = {};
      this.send('position fen ' + fen);
      const done = this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (l.startsWith('info')) {
            const r = parseInfo(l);
            if (r) (byDepth[r.depth] = byDepth[r.depth] || [])[r.multipv - 1] = r;
          }
        },
      );
      this.send(`go depth ${depth} movetime ${movetime}`);
      const bm = (await done).split(' ')[1];
      // usa a profundidade mais alta em que todas as linhas pedidas ficaram completas
      const depths = Object.keys(byDepth)
        .map(Number)
        .sort((x, y) => y - x);
      const full = depths.find((d) => (byDepth[d] as EngineLine[]).filter(Boolean).length >= multipv);
      const lines = depths.length ? (byDepth[full != null ? full : (depths[0] as number)] as EngineLine[]).filter(Boolean) : [];
      const best = (lines[0] && lines[0].pv[0]) || (bm && bm !== '(none)' ? bm : null);
      return { lines, best, bestmove: bm && bm !== '(none)' ? bm : null };
    });
  }
}

/** motor da análise da partida (classificações, dica) */
export const engine = new Engine();
/** motor do bot, das demonstrações e do estudo (deixa o da análise livre) */
export const botEngine = new Engine();
