// Motor de xadrez no servidor (mesmo espírito dos adaptadores da interface, ui/src/engine/adapters/): o resto da API
// fala só com UciEngine e não sabe qual versão do Stockfish está rodando. A lógica comum fica aqui: processo filho,
// leitura das linhas UCI, espera com prazo, opções e a busca em analyse(). Cada versão é uma subclasse (sf19-lite.mjs)
// que declara o próprio script, rótulo, versão e calibração e sobrescreve só os ganchos que mudam (Template Method):
// initCommands(), parseInfo(), parseBestmove().
//
// O motor roda num processo Node separado (o stockfish.js fala UCI por stdin/stdout): um lance ilegal ou um erro do
// WebAssembly derruba só o filho, nunca a API; e a memória do motor fica fora do heap da API.
// Análise determinística: Threads 1, Hash fixo, MultiPV 1, busca por profundidade fixa (nunca por tempo) e
// "ucinewgame" no começo de cada partida analisada.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { WP_K } from '../../../shared/rating.mjs';

/** tempo para o processo responder "uciok"/"readyok" */
export const BOOT_TIMEOUT = 20000;

export class EngineError extends Error {}

export class UciEngine {
  // ---------- o que cada versão declara ----------
  /** id do registro (registry.mjs) */
  id = 'base';
  /** nome para gente, ex. "Stockfish 19 (lite)" */
  label = 'UCI';
  /** versão do pacote de onde vem o motor (vai para games.engine_version) */
  version = '0';
  /** inclinação da curva centipeões → chance de vitória (a mesma da interface) */
  calibration = { wpK: WP_K };
  /** caminho do script do motor (rodado com o próprio node) */
  script() { throw new EngineError('script() não definido'); }

  // ---------- ganchos ----------
  /** opções depois do "uciok": uma thread, hash pequeno, uma linha */
  initCommands({ hashMb = 16 } = {}) {
    return [`setoption name Threads value 1`, `setoption name Hash value ${hashMb}`, 'setoption name MultiPV value 1'];
  }
  /** "info … depth N … score cp|mate V … pv …" → {depth, score}; null se não for linha de nota exata */
  parseInfo(l) {
    const t = l.split(' ');
    if (t[0] !== 'info') return null;
    const i = t.indexOf('score');
    if (i < 0) return null;
    if (t[i + 3] === 'lowerbound' || t[i + 3] === 'upperbound') return null;
    const v = parseInt(t[i + 2], 10);
    if (Number.isNaN(v)) return null;
    const mi = t.indexOf('multipv');
    if (mi > 0 && t[mi + 1] !== '1') return null;
    const di = t.indexOf('depth');
    return { depth: di > 0 ? Number(t[di + 1]) : 0, score: t[i + 1] === 'mate' ? { mate: v } : { cp: v } };
  }
  /** "bestmove e2e4 ponder e7e5" → "e2e4"; "(none)" → null */
  parseBestmove(l) {
    const m = l.split(' ')[1];
    return m && m !== '(none)' ? m : null;
  }

  // ---------- processo ----------
  constructor({ hashMb = 16, spawnFn = spawn } = {}) {
    this.hashMb = hashMb;
    this.spawnFn = spawnFn;
    this.proc = null;
    this.handlers = new Set();
    this.name = null;
    this.exited = null;
  }

  /** sobe o processo (uma vez) e espera ficar pronto */
  async start() {
    if (this.proc) return;
    const p = this.spawnFn(process.execPath, [this.script()], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    this.exited = new Promise((res) => p.once('exit', (code, sig) => res({ code, sig })));
    this.exited.then(() => {
      this.proc = null;
      for (const h of [...this.handlers]) h(null);
    });
    p.on('error', () => {});
    p.stdin.on('error', () => {});
    createInterface({ input: p.stdout }).on('line', (line) => { for (const h of [...this.handlers]) h(line); });
    p.stderr.resume();
    await this.waitFor((l) => l === 'uciok', BOOT_TIMEOUT, () => this.send('uci'), (l) => { if (l.startsWith('id name ')) this.name = l.slice(8); });
    for (const c of this.initCommands({ hashMb: this.hashMb })) this.send(c);
    await this.sync();
  }
  get pid() { return this.proc ? this.proc.pid : null; }
  send(cmd) {
    if (!this.proc) throw new EngineError('motor parado');
    this.proc.stdin.write(cmd + '\n');
  }
  /** espera uma linha que satisfaça pred; rejeita no prazo ou se o processo cair (linha null) */
  waitFor(pred, timeoutMs, kick, onLine) {
    return new Promise((resolve, reject) => {
      const h = (l) => {
        if (l === null) { done(); reject(new EngineError('o motor terminou')); return; }
        if (onLine) onLine(l);
        if (pred(l)) { done(); resolve(l); }
      };
      const timer = setTimeout(() => { done(); reject(new EngineError('o motor não respondeu no prazo')); }, timeoutMs);
      const done = () => { clearTimeout(timer); this.handlers.delete(h); };
      this.handlers.add(h);
      if (kick) { try { kick(); } catch (e) { done(); reject(e); } }
    });
  }
  sync(timeoutMs = BOOT_TIMEOUT) {
    return this.waitFor((l) => l === 'readyok', timeoutMs, () => this.send('isready'));
  }
  /** começa uma partida nova (limpa o hash): a mesma partida analisada de novo dá as mesmas notas */
  async newGame() {
    this.send('ucinewgame');
    await this.sync();
  }
  /**
   * Analisa uma posição: startFen + lances (UCI, já conferidos como legais — um lance ilegal derruba o processo).
   * Busca fixa: {depth} ou {nodes}. Devolve {score, best, depth} do ponto de vista de quem joga.
   */
  async analyse(startFen, moves, { depth, nodes, timeoutMs = 60000 } = {}) {
    const go = nodes ? `go nodes ${nodes}` : `go depth ${depth || 12}`;
    let last = null;
    const pos = (startFen ? `position fen ${startFen}` : 'position startpos') + (moves.length ? ' moves ' + moves.join(' ') : '');
    const bm = await this.waitFor((l) => l.startsWith('bestmove'), timeoutMs, () => { this.send(pos); this.send(go); }, (l) => {
      if (l.startsWith('info')) { const r = this.parseInfo(l); if (r) last = r; }
    });
    return { score: last ? last.score : null, depth: last ? last.depth : 0, best: this.parseBestmove(bm) };
  }
  /** encerra o processo (quit e, se não sair em 2 s, SIGKILL) */
  async stop() {
    const p = this.proc;
    if (!p) return;
    try { this.send('quit'); } catch (_) {}
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} }, 2000);
    await this.exited;
    clearTimeout(t);
  }
}
