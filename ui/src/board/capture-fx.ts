// ---------- Animações de captura ----------
// Cada efeito recebe um contexto: a casa (host), o lado da casa em px, as casas vizinhas com a distância
// e o elemento que pode tremer. Assim o mesmo efeito roda no tabuleiro e na prévia do painel de estilo.
import type { Color } from 'chess.js';
import { STYLE } from './pieces';
import { boardEl, squaresEl } from './render';

export interface FxCtx {
  host: HTMLElement;
  size: number;
  neighbors: { el: HTMLElement; d: number }[];
  shakeEl: HTMLElement;
  capturedColor: Color;
}
function fxEl(host: HTMLElement, cls: string, css?: Partial<CSSStyleDeclaration>): HTMLSpanElement {
  const e = document.createElement('span');
  e.className = cls;
  Object.assign(e.style, css || {});
  host.appendChild(e);
  return e;
}
const fxDone = (anim: Animation, el: Element) =>
  anim.finished.then(
    () => el.remove(),
    () => el.remove(),
  );
interface RingOpts {
  color: string;
  from?: number;
  to?: number;
  bw?: number;
  bwEnd?: number;
  dur?: number;
  delay?: number;
  shadow?: boolean;
}
function fxRing(ctx: FxCtx, { color, from = 0.25, to = 2.4, bw = 0.14, bwEnd = 0.02, dur = 900, delay = 0, shadow = true }: RingOpts): void {
  const r = fxEl(ctx.host, 'cfx-ring', {
    borderColor: color,
    boxShadow: shadow ? '0 0 0 1px rgba(0,0,0,.18), inset 0 0 0 1px rgba(0,0,0,.12)' : 'none',
  });
  fxDone(
    r.animate(
      [
        { opacity: 0.95, scale: from, borderWidth: `${ctx.size * bw}px` },
        { opacity: 0, scale: to, borderWidth: `${ctx.size * bwEnd}px` },
      ],
      { duration: dur, delay, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'backwards' },
    ),
    r,
  );
}
function fxSettle(ctx: FxCtx): void {
  const pc = ctx.host.querySelector('.pc');
  if (pc) pc.animate([{ scale: 1 }, { scale: 0.9, offset: 0.25 }, { scale: 1.04, offset: 0.6 }, { scale: 1 }], { duration: 420, easing: 'ease-out' });
}
export const CAPTURE_FX: Record<string, (ctx: FxCtx) => void> = {
  // sem animação: a peça só some (o som de captura continua)
  nenhuma() {},
  // 1. Gota: três anéis claros saindo um depois do outro
  gota(ctx) {
    for (let i = 0; i < 3; i++) fxRing(ctx, { color: 'rgba(255,255,255,.92)', delay: i * 150 });
    fxSettle(ctx);
  },
  // 2. Água: um disco azul se espalha e dois anéis azulados passam por cima
  agua(ctx) {
    const d = fxEl(ctx.host, 'cfx-disc', {
      background: 'radial-gradient(circle, rgba(110,195,255,.65) 0, rgba(110,195,255,.25) 45%, rgba(110,195,255,0) 70%)',
    });
    fxDone(
      d.animate(
        [
          { opacity: 0.9, scale: 0.3 },
          { opacity: 0, scale: 2.6 },
        ],
        { duration: 1000, easing: 'cubic-bezier(.2,.6,.3,1)' },
      ),
      d,
    );
    fxRing(ctx, { color: 'rgba(150,215,255,.95)', delay: 60, bw: 0.1 });
    fxRing(ctx, { color: 'rgba(150,215,255,.8)', delay: 260, bw: 0.07, to: 2.8 });
    fxSettle(ctx);
  },
  // 3. Respingo: um anel e oito gotículas que saltam em arco e caem
  respingo(ctx) {
    fxRing(ctx, { color: 'rgba(255,255,255,.92)', dur: 700, to: 2 });
    const u = ctx.size;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.2,
        dx = Math.cos(ang),
        dy = Math.sin(ang),
        sz = u * (0.09 + (i % 3) * 0.025);
      const e = fxEl(ctx.host, 'cfx-drop', { width: `${sz}px`, height: `${sz}px`, marginLeft: `${-sz / 2}px`, marginTop: `${-sz / 2}px` });
      fxDone(
        e.animate(
          [
            { translate: '0px 0px', scale: 0.6, opacity: 1 },
            { translate: `${dx * u * 0.5}px ${dy * u * 0.5 - u * 0.28}px`, scale: 1, opacity: 1, offset: 0.45 },
            { translate: `${dx * u * 0.95}px ${dy * u * 0.95 + u * 0.18}px`, scale: 0.4, opacity: 0 },
          ],
          { duration: 700, delay: 40, easing: 'cubic-bezier(.25,.7,.4,1)', fill: 'backwards' },
        ),
        e,
      );
    }
    fxSettle(ctx);
  },
  // 4. Estilhaços: a peça capturada se parte em cacos que voam girando e caem
  estilhacos(ctx) {
    const u = ctx.size,
      dark = ctx.capturedColor === 'b';
    const f = fxEl(ctx.host, 'cfx-flash', { background: dark ? 'rgba(40,40,40,.5)' : 'rgba(255,255,255,.7)' });
    fxDone(f.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }), f);
    for (let i = 0; i < 11; i++) {
      const ang = (i / 11) * Math.PI * 2 + Math.random() * 0.4,
        sz = u * (0.12 + Math.random() * 0.12);
      const dist = u * (0.55 + Math.random() * 0.45),
        spin = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360);
      const pts = [0, 1, 2].map(() => `${Math.round(Math.random() * 100)}% ${Math.round(Math.random() * 100)}%`).join(',');
      const e = fxEl(ctx.host, 'cfx-shard', {
        width: `${sz}px`,
        height: `${sz}px`,
        marginLeft: `${-sz / 2}px`,
        marginTop: `${-sz / 2}px`,
        clipPath: `polygon(${pts})`,
        background: dark ? 'linear-gradient(135deg,#55595a,#1d1f1e)' : 'linear-gradient(135deg,#ffffff,#cfc8b8)',
      });
      fxDone(
        e.animate(
          [
            { translate: '0px 0px', rotate: '0deg', opacity: 1 },
            {
              translate: `${Math.cos(ang) * dist * 0.6}px ${Math.sin(ang) * dist * 0.6 - u * 0.22}px`,
              rotate: `${spin * 0.5}deg`,
              opacity: 1,
              offset: 0.45,
            },
            { translate: `${Math.cos(ang) * dist}px ${Math.sin(ang) * dist + u * 0.35}px`, rotate: `${spin}deg`, opacity: 0 },
          ],
          { duration: 780, easing: 'cubic-bezier(.2,.7,.4,1)' },
        ),
        e,
      );
    }
    fxSettle(ctx);
  },
  // 5. Faíscas: brilho dourado no centro e faíscas finas disparando para todos os lados
  faiscas(ctx) {
    const u = ctx.size;
    const g = fxEl(ctx.host, 'cfx-disc', {
      background: 'radial-gradient(circle, rgba(255,240,180,.95) 0, rgba(255,190,60,.55) 30%, rgba(255,160,40,0) 65%)',
    });
    fxDone(
      g.animate(
        [
          { opacity: 0, scale: 0.2 },
          { opacity: 1, scale: 1.1, offset: 0.25 },
          { opacity: 0, scale: 1.8 },
        ],
        { duration: 600, easing: 'ease-out' },
      ),
      g,
    );
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * 360 + Math.random() * 12,
        len = u * (0.22 + Math.random() * 0.14),
        dist = u * (0.5 + Math.random() * 0.4);
      const e = fxEl(ctx.host, 'cfx-spark', {
        width: `${Math.max(2, u * 0.045)}px`,
        height: `${len}px`,
        marginLeft: `${-Math.max(2, u * 0.045) / 2}px`,
        marginTop: `${-len}px`,
      });
      fxDone(
        e.animate(
          [
            { transform: `rotate(${ang}deg) translateY(0px) scaleY(.3)`, opacity: 1 },
            { transform: `rotate(${ang}deg) translateY(${-dist * 0.55}px) scaleY(1)`, opacity: 1, offset: 0.35 },
            { transform: `rotate(${ang}deg) translateY(${-dist}px) scaleY(.2)`, opacity: 0 },
          ],
          { duration: 560 + Math.random() * 160, delay: Math.random() * 60, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'backwards' },
        ),
        e,
      );
    }
    fxSettle(ctx);
  },
};
function boardFxCtx(sq: string, capturedColor: Color): FxCtx | null {
  const host = squaresEl.querySelector<HTMLElement>(`[data-sq="${sq}"]`);
  if (!host) return null;
  const f0 = 'abcdefgh'.indexOf(sq[0] as string),
    r0 = +(sq[1] as string);
  const neighbors = [...squaresEl.querySelectorAll<HTMLElement>('.sq')].map((el) => {
    const s2 = el.dataset.sq as string;
    return { el, d: Math.max(Math.abs('abcdefgh'.indexOf(s2[0] as string) - f0), Math.abs(+(s2[1] as string) - r0)) };
  });
  return { host, size: host.getBoundingClientRect().width, neighbors, shakeEl: boardEl, capturedColor };
}
// captura no tabuleiro, com a animação escolhida no painel de estilo
export function rippleFx(sq: string, kind = STYLE.capture, capturedColor: Color = 'b'): void {
  const ctx = boardFxCtx(sq, capturedColor);
  if (!ctx) return;
  (CAPTURE_FX[kind] || (CAPTURE_FX.gota as (ctx: FxCtx) => void))(ctx);
}
