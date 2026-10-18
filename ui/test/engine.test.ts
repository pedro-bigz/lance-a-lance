import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { copyEngine, engineManifest } from '../build/stockfish-engine';
import {
  StockfishAdapter,
  wasmSupported,
  type BotSearch,
  type EngineCandidate,
  type EngineCapabilities,
  type WorkerFactory,
} from '../src/engine/adapters/base';
import { DEFAULT_ENGINE, ENGINE_ADAPTERS, createAdapter, resolveEngineId } from '../src/engine/adapters/registry';
import { Stockfish10Adapter } from '../src/engine/adapters/sf10';
import { Stockfish19LiteAdapter } from '../src/engine/adapters/sf19-lite';
import { ENGINE_VERSION } from '../src/engine/config';
import { BOTS } from '../src/core/constants';

const ENGINES = fileURLToPath(new URL('../engines', import.meta.url));
const LEVEL = (s: number): BotSearch => ({ skill: s, depth: 1, movetime: 10, random: 0 });

/** versão de mentira: só o que o contrato exige */
class FakeAdapter extends StockfishAdapter {
  readonly id = 'fake';
  readonly label = 'Fake';
  readonly version = '0.0.0';
  readonly candidates: readonly EngineCandidate[] = [
    { kind: 'wasm', script: 'f.js', wasm: 'f.wasm' },
    { kind: 'asm', script: 'f-asm.js' },
  ];
  readonly cdn = ['https://cdn.example/f/'];
  readonly capabilities: EngineCapabilities = { multiPvMax: 2, skillLevel: false, limitStrength: null, wdl: false };
  readonly botLevels = { novato: LEVEL(0), iniciante: LEVEL(1), intermediario: LEVEL(2), avancado: LEVEL(3), mestre: LEVEL(4), gm: LEVEL(5) };
  override initCommands(): string[] {
    return ['setoption name Fake value 1'];
  }
}

/** worker falso: responde ao handshake UCI e, num "go", manda as linhas info dadas e o bestmove */
function fakeWorker(sent: string[] = [], search: string[] = ['bestmove e2e4']): WorkerFactory {
  return () => {
    const w = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      onerror: null as unknown,
      postMessage(cmd: string) {
        sent.push(cmd);
        const out = cmd === 'uci' ? ['id name Fake 1', 'uciok'] : cmd === 'isready' ? ['readyok'] : cmd.startsWith('go') ? search : [];
        for (const line of out) queueMicrotask(() => w.onmessage && w.onmessage({ data: line }));
      },
      terminate() {},
    };
    return w as unknown as Worker;
  };
}
/** worker cujo .wasm não carrega: o stockfish.js lança dentro do worker, que vira o evento error */
function brokenWasmWorker(): WorkerFactory {
  return () => {
    const w = {
      onmessage: null,
      onerror: null as ((e: { preventDefault(): void }) => void) | null,
      postMessage() {},
      terminate() {},
    };
    setTimeout(() => w.onerror && w.onerror({ preventDefault() {} }), 5);
    return w as unknown as Worker;
  };
}
const labeled = (f: WorkerFactory, label: string): WorkerFactory => Object.assign(f, { label });

describe('contrato StockfishAdapter (versão falsa)', () => {
  it('arquivos e manifesto saem dos candidatos', () => {
    expect(new FakeAdapter().manifest()).toEqual({
      id: 'fake',
      label: 'Fake',
      version: '0.0.0',
      files: ['f.js', 'f.wasm', 'f-asm.js', 'STOCKFISH-LICENSE.txt'],
    });
  });
  it('candidatos: locais na ordem, depois a CDN por Blob; o .wasm vai no hash', () => {
    const s = new FakeAdapter().sources('https://app.example/dir/page.html');
    expect(s.map((x) => x.label)).toEqual(['wasm (local)', 'asm (local)', 'wasm (cdn.example)', 'asm (cdn.example)']);
    expect(s[0]).toMatchObject({
      blob: false,
      script: 'https://app.example/dir/f.js',
      url: 'https://app.example/dir/f.js#' + encodeURIComponent('https://app.example/dir/f.wasm'),
    });
    expect(s[3]).toMatchObject({ blob: true, url: 'https://cdn.example/f/f-asm.js' });
    expect(new FakeAdapter().sources('app://lance/', false).map((x) => x.label)).toEqual(['asm (local)', 'asm (cdn.example)']);
  });
  it('sobe o worker, manda os comandos da versão e guarda nome e candidato', async () => {
    const a = new FakeAdapter();
    const sent: string[] = [];
    await a.boot([labeled(fakeWorker(sent), 'wasm (local)')]);
    expect(sent).toEqual(['uci', 'setoption name Fake value 1', 'isready']);
    expect(a.name).toBe('Fake 1');
    expect(a.source).toBe('wasm (local)');
  });
  it('new Worker() que lança na hora passa para o próximo candidato (sem ReferenceError do timer)', async () => {
    const a = new FakeAdapter();
    let tried = 0;
    const throwing = () => {
      tried++;
      throw new Error('Worker bloqueado');
    };
    await expect(a.boot([throwing, fakeWorker()])).resolves.toBeUndefined();
    expect(tried).toBe(1);
    expect(a.w).not.toBeNull();
  });
  it('wasm que falha (erro no worker) cai na reserva asm', async () => {
    const a = new FakeAdapter();
    await a.boot([labeled(brokenWasmWorker(), 'wasm (local)'), labeled(fakeWorker(), 'asm (local)')]);
    expect(a.source).toBe('asm (local)');
  });
  it('wasm cujo .wasm não passa no teste (404 ou outro MIME) é pulado sem esperar o timeout', async () => {
    const a = new FakeAdapter();
    const wasm = labeled(fakeWorker(), 'wasm (local)');
    let made = 0;
    const spy: WorkerFactory = Object.assign(() => (made++, wasm()), { label: 'wasm (local)', probe: async () => false });
    await a.boot([spy, labeled(fakeWorker(), 'asm (local)')]);
    expect(made).toBe(0);
    expect(a.source).toBe('asm (local)');
  });
  it('só o candidato wasm confere o .wasm antes (HEAD, application/wasm)', async () => {
    const a = new FakeAdapter();
    const [w, asm] = a.sources('https://app.example/').map((s) => a.workerFactory(s));
    expect(w!.probe).toBeTypeOf('function');
    expect(asm!.probe).toBeUndefined();
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(null, { status: 200, headers: { 'content-type': url.endsWith('.wasm') ? 'text/plain' : 'application/wasm' } });
    }) as typeof fetch;
    try {
      expect(await w!.probe!()).toBe(false);
      expect(await a.probeWasm('https://app.example/ok')).toBe(true);
    } finally {
      globalThis.fetch = real;
    }
    expect(calls[0]).toBe('HEAD https://app.example/f.wasm');
  });
  it('todos os candidatos lançando: rejeita com "Stockfish indisponível"', async () => {
    const throwing = () => {
      throw new Error('Worker bloqueado');
    };
    await expect(new FakeAdapter().boot([throwing, throwing])).rejects.toThrow('Stockfish indisponível');
  });
  it('analyse: MultiPV limitado pela capacidade, sem Skill Level se a versão não tem, linhas da maior profundidade completa', async () => {
    const a = new FakeAdapter();
    const sent: string[] = [];
    const search = [
      'info depth 1 multipv 1 score cp 10 pv e2e4',
      'info depth 1 multipv 2 score cp 5 pv d2d4',
      'info depth 2 multipv 1 score cp 12 pv e2e4 e7e5',
      'bestmove e2e4 ponder e7e5',
    ];
    await a.boot([fakeWorker(sent, search)]);
    // (boot direto, sem start(): o ready do construtor só resolve pelo start)
    a.ready = Promise.resolve();
    const r = await a.analyse('8/8/8/8/8/8/8/K6k w - - 0 1', { multipv: 3, depth: 2, movetime: 10 });
    expect(sent).toContain('setoption name MultiPV value 2');
    expect(sent.some((c) => c.includes('Skill Level'))).toBe(false);
    expect(r && r.bestmove).toBe('e2e4');
    expect(r && r.lines.map((l) => l.pv[0])).toEqual(['e2e4']);
  });
  it('wasmSupported olha o instantiateStreaming', () => {
    expect(wasmSupported({})).toBe(false);
    expect(wasmSupported({ WebAssembly: {} })).toBe(false);
    expect(wasmSupported({ WebAssembly: { instantiateStreaming() {} } })).toBe(true);
  });
});

describe('registro e escolha da versão', () => {
  it('padrão é o Stockfish 19 lite; vazio volta ao padrão', () => {
    expect(DEFAULT_ENGINE).toBe('sf19-lite');
    expect(resolveEngineId(undefined)).toBe('sf19-lite');
    expect(resolveEngineId(' ')).toBe('sf19-lite');
    expect(resolveEngineId('sf10')).toBe('sf10');
    expect(ENGINE_VERSION).toBe('sf19-lite');
  });
  it('versão desconhecida: erro com a lista das registradas', () => {
    expect(() => createAdapter('sf99')).toThrow('Versão do Stockfish desconhecida: "sf99". Registradas: sf10, sf19-lite.');
    expect(() => resolveEngineId('sf99')).toThrow(/desconhecida/);
  });
  it('cada adaptador registrado tem todos os níveis do bot e os arquivos em engines/<id>/', () => {
    for (const id of Object.keys(ENGINE_ADAPTERS)) {
      const a = createAdapter(id);
      expect(a.id).toBe(id);
      for (const b of BOTS) if (b.id !== 'none') expect(a.botSearch(b.id)).toBeDefined();
      expect(() => engineManifest(ENGINES, id)).not.toThrow();
    }
  });
});

describe('Stockfish 10 (asm.js)', () => {
  const a = new Stockfish10Adapter();
  it('comandos de início com Contempt 0; sem UCI_LimitStrength', () => {
    expect(a.initCommands()).toEqual(['setoption name Hash value 32', 'setoption name Contempt value 0']);
    expect(a.strengthCommands(4, 1600)).toEqual([['Skill Level', 4]]);
  });
  it('candidatos: asm local, jsDelivr e unpkg', () => {
    expect(a.sources('app://lance/').map((s) => s.url)).toEqual([
      'app://lance/stockfish.asm.js',
      'https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.asm.js',
      'https://unpkg.com/stockfish@10.0.2/src/stockfish.asm.js',
    ]);
  });
  it('linha real do SF10: a variante para antes do "bmc"', () => {
    expect(a.parseInfo('info depth 12 seldepth 18 multipv 1 score cp 69 nodes 126411 nps 571995 time 221 pv g1f3 g8f6 b1c3 bmc 2.00185')).toEqual({
      multipv: 1,
      depth: 12,
      score: { cp: 69 },
      pv: ['g1f3', 'g8f6', 'b1c3'],
    });
  });
  it('níveis do bot calibrados para o SF10 (Skill Level, sem Elo)', () => {
    expect(a.botSearch('avancado')).toEqual({ skill: 9, depth: 8, movetime: 800, random: 0 });
    expect(a.botSearch('novato').random).toBe(0.55);
  });
});

describe('Stockfish 19 lite', () => {
  const a = new Stockfish19LiteAdapter();
  it('sem Contempt (não existe mais)', () => {
    expect(a.initCommands()).toEqual(['setoption name Hash value 32']);
  });
  it('candidatos: wasm local, asm local, wasm e asm no unpkg; sem WebAssembly só os asm', () => {
    const s = a.sources('app://lance/');
    expect(s.map((x) => x.label)).toEqual(['wasm (local)', 'asm (local)', 'wasm (unpkg.com)', 'asm (unpkg.com)']);
    expect(s[0]!.url).toBe('app://lance/stockfish-19-lite-single.js#' + encodeURIComponent('app://lance/stockfish-19-lite-single.wasm'));
    expect(s[2]!.url).toBe(
      'https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-lite-single.js#' +
        encodeURIComponent('https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-lite-single.wasm'),
    );
    expect(a.sources('app://lance/', false).map((x) => x.url)).toEqual([
      'app://lance/stockfish-19-asm.js',
      'https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-asm.js',
    ]);
    expect(a.files).toEqual(['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'stockfish-19-asm.js', 'STOCKFISH-LICENSE.txt']);
  });
  it('linhas reais do SF19 (multipv, wdl, mate, hashfull)', () => {
    expect(
      a.parseInfo(
        'info depth 12 seldepth 27 multipv 2 score cp 23 nodes 47403 nps 1077340 hashfull 16 time 44 pv b1c3 b8c6 g1f3 g8f6 f1b5 f8d6 d2d4 e5d4 f3d4 e8g8 d4f5 d6e5 c3d5 f6d5 e4d5 c6b4',
      ),
    ).toMatchObject({ multipv: 2, depth: 12, score: { cp: 23 }, pv: expect.arrayContaining(['b1c3', 'c6b4']) });
    expect(a.parseInfo('info depth 8 seldepth 2 multipv 1 score mate 1 wdl 1000 0 0 nodes 1474 nps 294800 hashfull 0 time 5 pv h5f7')).toEqual({
      multipv: 1,
      depth: 8,
      score: { mate: 1 },
      pv: ['h5f7'],
      wdl: [1000, 0, 0],
    });
    expect(
      a.parseInfo('info depth 3 seldepth 5 multipv 2 score cp -113 wdl 0 374 626 nodes 448 nps 112000 hashfull 0 time 4 pv h5e2 c6d4 e2d3'),
    ).toMatchObject({
      score: { cp: -113 },
      wdl: [0, 374, 626],
      pv: ['h5e2', 'c6d4', 'e2d3'],
    });
  });
  it('ignora limites, linhas sem nota e o "mate 0" do fim de jogo', () => {
    expect(a.parseInfo('info depth 9 score cp 20 lowerbound pv e2e4')).toBeNull();
    expect(a.parseInfo('info depth 9 seldepth 9 multipv 1 score cp 20 upperbound nodes 1 pv e2e4')).toBeNull();
    expect(a.parseInfo('info string Network replica 1: Local memory. Shared memory not supported by the OS.')).toBeNull();
    expect(a.parseInfo('info depth 0 score mate 0')).toBeNull();
    expect(a.parseInfo('info depth 1 multipv 1 score cp 12 nodes 77 nps 38500 hashfull 0 time 2 pv b1c3')).toEqual({
      multipv: 1,
      depth: 1,
      score: { cp: 12 },
      pv: ['b1c3'],
    });
  });
  it('bestmove, inclusive sem lance legal', () => {
    expect(a.parseBestmove('bestmove h5f7')).toBe('h5f7');
    expect(a.parseBestmove('bestmove e7e8q ponder a1a2')).toBe('e7e8q');
    expect(a.parseBestmove('bestmove (none)')).toBeNull();
  });
  it('força: Avançado e Mestre por UCI_Elo (limitado à faixa do motor); análise com força total', () => {
    expect(a.botSearch('avancado')).toMatchObject({ elo: 1600 });
    expect(a.botSearch('mestre')).toMatchObject({ elo: 2200 });
    expect(a.botSearch('gm').elo).toBeUndefined();
    expect(a.strengthCommands(20, 1600)).toEqual([
      ['Skill Level', 20],
      ['UCI_LimitStrength', 'true'],
      ['UCI_Elo', 1600],
    ]);
    expect(a.strengthCommands(0, 400)).toContainEqual(['UCI_Elo', 1320]);
    expect(a.strengthCommands(20)).toEqual([
      ['Skill Level', 20],
      ['UCI_LimitStrength', 'false'],
    ]);
  });
});

describe('build: só os arquivos da versão escolhida', () => {
  it('copia os arquivos de engines/<id>/ e grava engine.json', () => {
    for (const id of ['sf10', 'sf19-lite']) {
      const out = mkdtempSync(join(tmpdir(), 'sf-'));
      const m = copyEngine(ENGINES, out, engineManifest(ENGINES, id));
      expect(readdirSync(out).sort()).toEqual([...m.files, 'engine.json'].sort());
      expect(JSON.parse(readFileSync(join(out, 'engine.json'), 'utf8'))).toEqual(m);
    }
    expect(engineManifest(ENGINES, 'sf10').files).toEqual(['stockfish.asm.js', 'STOCKFISH-LICENSE.txt']);
  });
  it('versão desconhecida ou arquivo faltando: erro claro', () => {
    expect(() => engineManifest(ENGINES, 'sf99')).toThrow(/Registradas: sf10, sf19-lite/);
    const dir = mkdtempSync(join(tmpdir(), 'eng-'));
    mkdirSync(join(dir, 'sf10'));
    writeFileSync(join(dir, 'sf10', 'stockfish.asm.js'), '');
    expect(() => engineManifest(dir, 'sf10')).toThrow('Faltam arquivos do Stockfish "sf10" em engines/sf10/: STOCKFISH-LICENSE.txt');
  });
});
