/* Som curto de lance (só toca depois da primeira interação) */
import type { ClsKey } from '../core/constants';

let actx: AudioContext | null = null;
const audio = (): AudioContext => (actx = actx || new (window.AudioContext || (window.webkitAudioContext as typeof AudioContext))());
function tone(freq: number, dur: number, vol: number, type?: OscillatorType): void {
  try {
    const ctx = audio();
    const t = ctx.currentTime,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (_) {}
}
// som do lance: comum, captura, xeque (alerta em dois tons) e xeque-mate (arpejo)
export function moveSound(kind: 'move' | 'check' | 'mate', captured: boolean): void {
  if (captured) captureSound();
  const d = captured ? 110 : 0; // numa captura com xeque, o alerta vem logo depois do som da captura
  if (kind === 'check') {
    setTimeout(() => tone(740, 0.08, 0.06, 'square'), d);
    setTimeout(() => tone(988, 0.14, 0.06, 'square'), d + 85);
  } else if (kind === 'mate') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, i === 3 ? 0.45 : 0.14, 0.07, 'sine'), d + i * 110));
  else if (!captured) tone(294, 0.09, 0.07);
}
// captura: estalo curto de ruído filtrado + um "tum" grave, bem diferente do lance comum
function captureSound(): void {
  try {
    const ctx = audio();
    const t = ctx.currentTime,
      len = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate),
      data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(),
      filt = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = buf;
    filt.type = 'bandpass';
    filt.frequency.value = 1800;
    filt.Q.value = 0.9;
    g.gain.value = 0.35;
    src.connect(filt).connect(g).connect(ctx.destination);
    src.start(t);
    const o = ctx.createOscillator(),
      og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    og.gain.setValueAtTime(0.16, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.22);
  } catch (_) {}
}
export function ding(key: ClsKey): void {
  if (key === 'brilhante') {
    tone(880, 0.12, 0.05, 'sine');
    setTimeout(() => tone(1320, 0.18, 0.05, 'sine'), 90);
  } else if (key === 'capivarada') tone(110, 0.25, 0.06, 'sawtooth');
}
