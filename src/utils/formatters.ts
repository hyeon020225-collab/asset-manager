export function fmtKRW(amount: number): string {
  if (!Number.isFinite(amount)) return '0원';
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

export function fmtSignedKRW(amount: number): string {
  if (!Number.isFinite(amount)) return '0원';
  const r = Math.round(amount);
  if (r > 0) return `+${r.toLocaleString('ko-KR')}원`;
  if (r < 0) return `-${Math.abs(r).toLocaleString('ko-KR')}원`;
  return '0원';
}

export function fmtCompactKRW(amount: number): string {
  if (!Number.isFinite(amount)) return '0원';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000;
    return `${sign}${eok >= 10 ? eok.toFixed(0) : eok.toFixed(1)}억 원`;
  }
  if (abs >= 10_000) {
    const man = abs / 10_000;
    return `${sign}${Math.round(man).toLocaleString('ko-KR')}만 원`;
  }
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}원`;
}

export function fmtPct(rate: number, digits: number = 1, signed: boolean = false): string {
  if (!Number.isFinite(rate)) return '0.0%';
  const pct = rate * 100;
  const fixed = Math.abs(pct).toFixed(digits);
  if (signed) {
    if (pct > 0.0001) return `+${fixed}%`;
    if (pct < -0.0001) return `-${fixed}%`;
    return `${(0).toFixed(digits)}%`;
  }
  return `${pct.toFixed(digits)}%`;
}

export function profileLabel(id: 'conservative' | 'moderate' | 'aggressive'): string {
  return id === 'conservative' ? '보수형' : id === 'moderate' ? '중립형' : '위험감수형';
}
