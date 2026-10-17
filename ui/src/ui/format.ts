// Formatação de datas, números e variação de pontuação (pt-BR)
export const fmtDate = (t: number): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t);
  } catch (_) {
    return new Date(t).toLocaleString();
  }
};
export const fmtDay = (t: string | number | null | undefined): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t as string));
  } catch (_) {
    return String(t || '').slice(0, 10);
  }
};
export const fmtNum = (n: number, d = 0): string => {
  try {
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  } catch (_) {
    return String(n);
  }
};
export const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);
export function fmtDelta(d: number): string {
  return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
}
