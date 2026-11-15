export type QuickRiskProfileId = 'conservative' | 'moderate' | 'aggressive';
export type QuickHorizonId = '1m' | '6m' | '1y' | '10y';

export interface QuickRiskPreset {
  id: QuickRiskProfileId;
  label: string;
  shortDesc: string;
  defaultAnnualReturn: number;
  defaultAnnualVolatility: number;
}

export interface QuickHorizonOption {
  id: QuickHorizonId;
  label: string;
  subLabel: string;
  years: number;
  steps: number;
}

export interface QuickSimParams {
  principal: number;
  profileId: QuickRiskProfileId;
  horizonId: QuickHorizonId;
  annualReturn: number;
  annualVolatility: number;
}

export interface QuickPathPoint {
  step: number;
  label: string;
  value: number;
}

export interface QuickSingleRunResult {
  id: number;
  principal: number;
  finalValue: number;
  profitLoss: number;
  returnRate: number;
  points: QuickPathPoint[];
  horizonId: QuickHorizonId;
  profileId: QuickRiskProfileId;
  annualReturn: number;
  annualVolatility: number;
}

export interface QuickBandPoint {
  step: number;
  label: string;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface QuickHistogramBin {
  start: number;
  end: number;
  midpoint: number;
  count: number;
  percentage: number;
  isLossBin: boolean;
}

export interface QuickMonteCarloResult {
  runCount: number;
  principal: number;
  horizonId: QuickHorizonId;
  profileId: QuickRiskProfileId;
  annualReturn: number;
  annualVolatility: number;
  medianFinal: number;
  meanFinal: number;
  top5Final: number;
  bottom5Final: number;
  lossProbability: number;
  profitProbability: number;
  sortedFinals: number[];
  histogram: QuickHistogramBin[];
  bands: QuickBandPoint[];
  elapsedMs: number;
}

export const QUICK_DEFAULT_PRINCIPAL = 1_000_000;
export const QUICK_MIN_PRINCIPAL = 10_000;
export const QUICK_MAX_PRINCIPAL = 10_000_000_000;
export const QUICK_MONTE_CARLO_RUNS = 10_000;

export const QUICK_RISK_PROFILES: Record<QuickRiskProfileId, QuickRiskPreset> = {
  conservative: {
    id: 'conservative',
    label: '보수형',
    shortDesc: '낮은 위험과 상대적으로 낮은 기대수익',
    defaultAnnualReturn: 0.04,
    defaultAnnualVolatility: 0.06,
  },
  moderate: {
    id: 'moderate',
    label: '중립형',
    shortDesc: '위험과 기대수익의 균형',
    defaultAnnualReturn: 0.07,
    defaultAnnualVolatility: 0.13,
  },
  aggressive: {
    id: 'aggressive',
    label: '위험감수형',
    shortDesc: '높은 변동성과 높은 기대수익 가능성',
    defaultAnnualReturn: 0.105,
    defaultAnnualVolatility: 0.22,
  },
};

export const QUICK_HORIZON_OPTIONS: Record<QuickHorizonId, QuickHorizonOption> = {
  '1m': { id: '1m', label: '1개월', subLabel: '21거래일', years: 1 / 12, steps: 21 },
  '6m': { id: '6m', label: '6개월', subLabel: '26주', years: 0.5, steps: 26 },
  '1y': { id: '1y', label: '1년', subLabel: '52주', years: 1, steps: 52 },
  '10y': { id: '10y', label: '10년', subLabel: '120개월', years: 10, steps: 120 },
};

export const QUICK_PROFILE_ORDER: QuickRiskProfileId[] = ['conservative', 'moderate', 'aggressive'];
export const QUICK_HORIZON_ORDER: QuickHorizonId[] = ['1m', '6m', '1y', '10y'];

function boxMullerNormal(): number {
  const u1 = Math.max(1e-12, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export function formatQuickStepLabel(horizonId: QuickHorizonId, step: number): string {
  if (step === 0) return '시작';
  if (horizonId === '1m') return `${step}일`;
  if (horizonId === '6m' || horizonId === '1y') return `${step}주`;
  const y = Math.floor(step / 12);
  const m = step % 12;
  if (m === 0) return `${y}년`;
  if (y === 0) return `${m}개월`;
  return `${y}년 ${m}개월`;
}

/**
 * Geometric Brownian Motion (GBM) single path simulation.
 */
export function runQuickSingleSimulation(
  params: QuickSimParams,
  runId: number
): QuickSingleRunResult {
  const horizon = QUICK_HORIZON_OPTIONS[params.horizonId];
  const dt = horizon.years / horizon.steps;
  const drift = (params.annualReturn - 0.5 * params.annualVolatility * params.annualVolatility) * dt;
  const volStep = params.annualVolatility * Math.sqrt(dt);

  const points: QuickPathPoint[] = [
    { step: 0, label: formatQuickStepLabel(params.horizonId, 0), value: params.principal },
  ];

  let current = params.principal;
  for (let s = 1; s <= horizon.steps; s++) {
    const z = boxMullerNormal();
    current = current * Math.exp(drift + volStep * z);
    points.push({
      step: s,
      label: formatQuickStepLabel(params.horizonId, s),
      value: current,
    });
  }

  const finalValue = current;
  const profitLoss = finalValue - params.principal;
  const returnRate = params.principal > 0 ? profitLoss / params.principal : 0;

  return {
    id: runId,
    principal: params.principal,
    finalValue,
    profitLoss,
    returnRate,
    points,
    horizonId: params.horizonId,
    profileId: params.profileId,
    annualReturn: params.annualReturn,
    annualVolatility: params.annualVolatility,
  };
}

function getSortedPercentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

/**
 * 10,000-run Monte Carlo GBM simulation sharing identical assumptions with single run.
 */
export function runQuickMonteCarlo(
  params: QuickSimParams,
  runCount: number = QUICK_MONTE_CARLO_RUNS
): QuickMonteCarloResult {
  const t0 = performance.now();
  const horizon = QUICK_HORIZON_OPTIONS[params.horizonId];
  const steps = horizon.steps;
  const dt = horizon.years / steps;
  const drift = (params.annualReturn - 0.5 * params.annualVolatility * params.annualVolatility) * dt;
  const volStep = params.annualVolatility * Math.sqrt(dt);

  const stepBuckets: Float64Array[] = Array.from(
    { length: steps + 1 },
    () => new Float64Array(runCount)
  );

  let lossCount = 0;
  let profitCount = 0;
  let sumFinals = 0;

  for (let r = 0; r < runCount; r++) {
    let current = params.principal;
    stepBuckets[0][r] = current;
    for (let s = 1; s <= steps; s++) {
      const z = boxMullerNormal();
      current = current * Math.exp(drift + volStep * z);
      stepBuckets[s][r] = current;
    }
    sumFinals += current;
    if (current < params.principal) lossCount++;
    else if (current > params.principal) profitCount++;
  }

  const bands: QuickBandPoint[] = [];
  for (let s = 0; s <= steps; s++) {
    const arr = stepBuckets[s];
    arr.sort();
    bands.push({
      step: s,
      label: formatQuickStepLabel(params.horizonId, s),
      p05: getSortedPercentile(arr, 0.05),
      p25: getSortedPercentile(arr, 0.25),
      p50: getSortedPercentile(arr, 0.5),
      p75: getSortedPercentile(arr, 0.75),
      p95: getSortedPercentile(arr, 0.95),
    });
  }

  const sortedFinals = Array.from(stepBuckets[steps]);
  const medianFinal = getSortedPercentile(sortedFinals, 0.5);
  const meanFinal = sumFinals / runCount;
  const top5Final = getSortedPercentile(sortedFinals, 0.95);
  const bottom5Final = getSortedPercentile(sortedFinals, 0.05);

  const histLow = Math.min(params.principal * 0.85, getSortedPercentile(sortedFinals, 0.005));
  const histHigh = Math.max(params.principal * 1.15, getSortedPercentile(sortedFinals, 0.992));
  const binCount = 28;
  const binWidth = Math.max(1, (histHigh - histLow) / binCount);

  const histogram: QuickHistogramBin[] = Array.from({ length: binCount }, (_, idx) => {
    const start = histLow + idx * binWidth;
    const end = start + binWidth;
    return {
      start,
      end,
      midpoint: (start + end) / 2,
      count: 0,
      percentage: 0,
      isLossBin: (start + end) / 2 < params.principal,
    };
  });

  for (let i = 0; i < sortedFinals.length; i++) {
    let idx = Math.floor((sortedFinals[i] - histLow) / binWidth);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    histogram[idx].count++;
  }
  for (let i = 0; i < histogram.length; i++) {
    histogram[i].percentage = (histogram[i].count / runCount) * 100;
  }

  return {
    runCount,
    principal: params.principal,
    horizonId: params.horizonId,
    profileId: params.profileId,
    annualReturn: params.annualReturn,
    annualVolatility: params.annualVolatility,
    medianFinal,
    meanFinal,
    top5Final,
    bottom5Final,
    lossProbability: lossCount / runCount,
    profitProbability: profitCount / runCount,
    sortedFinals,
    histogram,
    bands,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

export function getQuickPercentileRank(sortedFinals: number[], value: number): number {
  if (sortedFinals.length === 0) return 50;
  let lo = 0;
  let hi = sortedFinals.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedFinals[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return (lo / sortedFinals.length) * 100;
}

export function parseQuickParamsFromSearch(search: string): {
  hasQuickQuery: boolean;
  params: QuickSimParams;
} {
  const q = new URLSearchParams(search);
  const hasQuickQuery =
    q.has('amount') || q.has('profile') || q.has('horizon') || q.has('mu') || q.has('sigma');

  const rawPrincipal = Number(q.get('amount'));
  const principal =
    q.has('amount') &&
    Number.isFinite(rawPrincipal) &&
    rawPrincipal >= QUICK_MIN_PRINCIPAL &&
    rawPrincipal <= QUICK_MAX_PRINCIPAL
      ? Math.round(rawPrincipal)
      : QUICK_DEFAULT_PRINCIPAL;

  const rawProfile = q.get('profile') as QuickRiskProfileId | null;
  const profileId: QuickRiskProfileId =
    rawProfile && rawProfile in QUICK_RISK_PROFILES ? rawProfile : 'moderate';

  const rawHorizon = q.get('horizon') as QuickHorizonId | null;
  const horizonId: QuickHorizonId =
    rawHorizon && rawHorizon in QUICK_HORIZON_OPTIONS ? rawHorizon : '1y';

  const preset = QUICK_RISK_PROFILES[profileId];
  const rawMu = Number(q.get('mu'));
  const rawSigma = Number(q.get('sigma'));

  const annualReturn =
    q.has('mu') && Number.isFinite(rawMu) && rawMu >= -0.2 && rawMu <= 0.4
      ? rawMu
      : preset.defaultAnnualReturn;

  const annualVolatility =
    q.has('sigma') && Number.isFinite(rawSigma) && rawSigma >= 0.005 && rawSigma <= 0.8
      ? rawSigma
      : preset.defaultAnnualVolatility;

  return {
    hasQuickQuery,
    params: { principal, profileId, horizonId, annualReturn, annualVolatility },
  };
}

export function buildQuickShareUrl(baseHref: string, params: QuickSimParams): string {
  const url = new URL(baseHref);
  url.searchParams.set('amount', String(params.principal));
  url.searchParams.set('profile', params.profileId);
  url.searchParams.set('horizon', params.horizonId);
  url.searchParams.set('mu', params.annualReturn.toFixed(4));
  url.searchParams.set('sigma', params.annualVolatility.toFixed(4));
  return url.toString();
}
