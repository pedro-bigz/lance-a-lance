// Fila de análise da pontuação, no processo da API: uma partida por vez (a máquina é limitada e o Stockfish usa um
// núcleo inteiro), sem duplicar a mesma partida na fila. Ao iniciar, a API chama resume() para reprocessar as
// pendentes (e as que falharam com tentativas sobrando). Falha → a partida fica 'failed' com rating_attempts + 1 e
// volta para a fila depois de um intervalo crescente, até maxAttempts.
//
// A fila não conhece SQL nem Stockfish: recebe um store (load, pendingIds, apply, markFailed; src/rating/store.mjs)
// e uma função analyse(game) (src/rating/index.mjs). Assim os testes trocam os dois por falsos.

export class PermanentRatingError extends Error {}

export class RatingQueue {
  constructor({ store, analyse, maxAttempts = 3, retryDelayMs = 30000, log = () => {}, onIdle = null }) {
    this.store = store;
    this.analyse = analyse;
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
    this.log = log;
    this.onIdle = onIdle;
    this.queue = [];
    this.queued = new Set();
    this.running = false;
    this.timers = new Set();
    this.waiters = [];
    this.stopped = false;
  }
  /** põe a partida (id interno) na fila; repetida enquanto espera não entra de novo */
  enqueue(id) {
    const k = String(id);
    if (this.stopped || this.queued.has(k)) return false;
    this.queued.add(k);
    this.queue.push(id);
    void this.pump();
    return true;
  }
  /** reprocessa as pendentes gravadas no banco (subida da API) */
  async resume() {
    const ids = await this.store.pendingIds(this.maxAttempts);
    for (const id of ids) this.enqueue(id);
    return ids.length;
  }
  get size() { return this.queue.length + (this.running ? 1 : 0); }
  /** resolve quando a fila esvaziar (testes e encerramento) */
  idle() {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise((res) => this.waiters.push(res));
  }
  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.stopped) {
        const id = this.queue.shift();
        this.queued.delete(String(id));
        await this.processOne(id);
      }
    } finally {
      this.running = false;
      if (!this.queue.length) {
        for (const w of this.waiters.splice(0)) w();
        if (this.onIdle) this.onIdle();
      }
    }
  }
  async processOne(id) {
    let game;
    try {
      game = await this.store.load(id);
      if (!game || (game.rating_status !== 'pending' && game.rating_status !== 'failed')) return;   // já aplicada ou não vale
      const t0 = Date.now();
      const analysis = await this.analyse(game);
      const out = await this.store.apply(id, analysis);
      if (out && out.applied) this.log(`pontuação aplicada (partida ${id}): ${out.delta > 0 ? '+' : ''}${out.delta}, precisão ${out.accuracy.toFixed(1)}, ${Date.now() - t0} ms`);
    } catch (e) {
      const permanent = e instanceof PermanentRatingError;
      let attempts = this.maxAttempts;
      try { attempts = await this.store.markFailed(id, permanent ? this.maxAttempts : null); } catch (e2) { this.log(`falha ao marcar a pontuação como falha (partida ${id}): ${e2.message}`); }
      this.log(`falha ao calcular a pontuação (partida ${id}, tentativa ${attempts}/${this.maxAttempts}): ${e.message}`);
      if (!permanent && attempts < this.maxAttempts && !this.stopped) {
        const t = setTimeout(() => { this.timers.delete(t); this.enqueue(id); }, this.retryDelayMs * attempts);
        if (t.unref) t.unref();
        this.timers.add(t);
      }
    }
  }
  /** para de aceitar e cancela as novas tentativas agendadas (a que está rodando termina) */
  async stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.queue.length = 0;
    this.queued.clear();
    await this.idle();
  }
}
