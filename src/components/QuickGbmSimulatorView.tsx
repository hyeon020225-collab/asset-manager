import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Dices,
  Info,
  Layers,
  Minus,
  RotateCcw,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';
import {
  getQuickPercentileRank,
  QUICK_HORIZON_OPTIONS,
  QUICK_HORIZON_ORDER,
  QUICK_MAX_PRINCIPAL,
  QUICK_MIN_PRINCIPAL,
  QUICK_PROFILE_ORDER,
  QUICK_RISK_PROFILES,
  QuickHorizonId,
  QuickMonteCarloResult,
  QuickRiskProfileId,
  QuickSimParams,
  QuickSingleRunResult,
} from '../engine/gbmQuickSim';
import { fmtCompactKRW, fmtKRW, fmtPct, fmtSignedKRW } from '../utils/formatters';

interface QuickGbmSimulatorViewProps {
  params: QuickSimParams;
  singleRun: QuickSingleRunResult;
  recentRuns: QuickSingleRunResult[];
  monteCarlo: QuickMonteCarloResult;
  animationKey: number;
  isRunningMc: boolean;
  analyzedInitialCash: number;
  onChangePrincipal: (principal: number) => void;
  onSelectProfile: (profileId: QuickRiskProfileId) => void;
  onSelectHorizon: (horizonId: QuickHorizonId) => void;
  onChangeAssumptions: (annualReturn: number, annualVolatility: number) => void;
  onResetAssumptions: () => void;
  onRunSingle: () => void;
  onRunMonteCarlo: () => void;
  onSelectHistoryRun: (run: QuickSingleRunResult) => void;
}

const PRINCIPAL_PRESETS = [
  { label: '100만', value: 1_000_000 },
  { label: '500만', value: 5_000_000 },
  { label: '1,000만', value: 10_000_000 },
  { label: '3,000만', value: 30_000_000 },
];

export function QuickGbmSimulatorView({
  params,
  singleRun,
  recentRuns,
  monteCarlo,
  animationKey,
  isRunningMc,
  analyzedInitialCash,
  onChangePrincipal,
  onSelectProfile,
  onSelectHorizon,
  onChangeAssumptions,
  onResetAssumptions,
  onRunSingle,
  onRunMonteCarlo,
  onSelectHistoryRun,
}: QuickGbmSimulatorViewProps) {
  const [inputText, setInputText] = useState(params.principal.toLocaleString('ko-KR'));
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [showBands, setShowBands] = useState(true);
  const [progress, setProgress] = useState(1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoveredBinIdx, setHoveredBinIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setInputText(params.principal.toLocaleString('ko-KR'));
  }, [params.principal]);

  const replayAnimation = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setProgress(1);
      return;
    }
    setProgress(0);
    const start = performance.now();
    const duration = 700;
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  };

  useEffect(() => {
    setHoverIdx(null);
    return replayAnimation();
  }, [animationKey]);

  const currentPreset = QUICK_RISK_PROFILES[params.profileId];
  const isCustomAssumptions =
    Math.abs(params.annualReturn - currentPreset.defaultAnnualReturn) > 0.0001 ||
    Math.abs(params.annualVolatility - currentPreset.defaultAnnualVolatility) > 0.0001;

  const handlePrincipalInputChange = (raw: string) => {
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      setInputText('');
      return;
    }
    const num = Number(digitsOnly);
    setInputText(num.toLocaleString('ko-KR'));
    if (num >= QUICK_MIN_PRINCIPAL && num <= QUICK_MAX_PRINCIPAL) {
      onChangePrincipal(num);
    }
  };

  const handlePrincipalBlur = () => {
    const digitsOnly = inputText.replace(/[^0-9]/g, '');
    const num = Number(digitsOnly);
    const clamped =
      !digitsOnly || !Number.isFinite(num)
        ? 1_000_000
        : Math.min(QUICK_MAX_PRINCIPAL, Math.max(QUICK_MIN_PRINCIPAL, num));
    setInputText(clamped.toLocaleString('ko-KR'));
    onChangePrincipal(clamped);
  };

  // Line Chart Calculations
  const points = singleRun.points;
  const bands =
    showBands &&
    monteCarlo.horizonId === singleRun.horizonId &&
    monteCarlo.principal === singleRun.principal
      ? monteCarlo.bands
      : null;

  const { minVal, maxVal } = useMemo(() => {
    let min = singleRun.principal;
    let max = singleRun.principal;
    for (const pt of points) {
      if (pt.value < min) min = pt.value;
      if (pt.value > max) max = pt.value;
    }
    if (bands) {
      for (const b of bands) {
        if (b.p05 < min) min = b.p05;
        if (b.p95 > max) max = b.p95;
      }
    }
    const pad = Math.max((max - min) * 0.14, singleRun.principal * 0.04);
    return { minVal: Math.max(0, min - pad), maxVal: max + pad };
  }, [points, bands, singleRun.principal]);

  const width = 760;
  const height = 290;
  const padLeft = 72;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (idx: number) => padLeft + (idx / Math.max(1, points.length - 1)) * plotW;
  const toY = (val: number) =>
    padTop + plotH - ((val - minVal) / Math.max(1, maxVal - minVal)) * plotH;

  const visibleCount = Math.max(1, Math.round(1 + (points.length - 1) * progress));
  const visiblePoints = points.slice(0, visibleCount);
  const linePath = visiblePoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(pt.value).toFixed(1)}`)
    .join(' ');
  const areaPath =
    visiblePoints.length > 1
      ? `${linePath} L${toX(visiblePoints.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
      : '';

  const band90Polygon = useMemo(() => {
    if (!bands || bands.length !== points.length) return '';
    const up = bands.map((b, i) => `${toX(i).toFixed(1)},${toY(b.p95).toFixed(1)}`);
    const lo = [...bands]
      .reverse()
      .map((b, revI) => `${toX(bands.length - 1 - revI).toFixed(1)},${toY(b.p05).toFixed(1)}`);
    return `M${up.join(' L')} L${lo.join(' L')} Z`;
  }, [bands, points.length, minVal, maxVal]);

  const band50Polygon = useMemo(() => {
    if (!bands || bands.length !== points.length) return '';
    const up = bands.map((b, i) => `${toX(i).toFixed(1)},${toY(b.p75).toFixed(1)}`);
    const lo = [...bands]
      .reverse()
      .map((b, revI) => `${toX(bands.length - 1 - revI).toFixed(1)},${toY(b.p25).toFixed(1)}`);
    return `M${up.join(' L')} L${lo.join(' L')} Z`;
  }, [bands, points.length, minVal, maxVal]);

  const medianBandPath = useMemo(() => {
    if (!bands || bands.length !== points.length) return '';
    return bands
      .map((b, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(b.p50).toFixed(1)}`)
      .join(' ');
  }, [bands, points.length, minVal, maxVal]);

  const handlePointerMove = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    const clampedX = Math.max(padLeft, Math.min(width - padRight, relX));
    const idx = Math.round(((clampedX - padLeft) / plotW) * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const activePoint = hoverIdx !== null ? points[hoverIndexOrZero(hoverIdx)] : points[visiblePoints.length - 1];
  function hoverIndexOrZero(v: number) {
    return Math.max(0, Math.min(points.length - 1, v));
  }

  const isGain = singleRun.profitLoss > 0;
  const isLoss = singleRun.profitLoss < 0;

  // Histogram Calculations
  const singlePercentile = useMemo(
    () => getQuickPercentileRank(monteCarlo.sortedFinals, singleRun.finalValue),
    [monteCarlo.sortedFinals, singleRun.finalValue]
  );
  const topRankPct = Math.max(0.1, Math.min(99.9, 100 - singlePercentile));

  const histH = 240;
  const hPadLeft = 44;
  const hPadRight = 20;
  const hPadTop = 34;
  const hPadBottom = 36;
  const hPlotW = width - hPadLeft - hPadRight;
  const hPlotH = histH - hPadTop - hPadBottom;
  const bins = monteCarlo.histogram;
  const minBin = bins[0]?.start ?? monteCarlo.principal * 0.8;
  const maxBin = bins[bins.length - 1]?.end ?? monteCarlo.principal * 1.2;
  const maxPct = Math.max(1, ...bins.map((b) => b.percentage));
  const valToHistX = (val: number) => {
    const ratio = Math.max(0, Math.min(1, (val - minBin) / Math.max(1, maxBin - minBin)));
    return hPadLeft + ratio * hPlotW;
  };
  const barW = hPlotW / Math.max(1, bins.length);
  const hoveredBin = hoveredBinIdx !== null ? bins[hoveredBinIdx] : null;

  return (
    <div className="space-y-6">
      {/* Core Educational Banner */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
          <span>무료 브라우저 JS 연산</span>
          <span aria-hidden="true">·</span>
          <span>로그인 및 API 키 불필요</span>
          <span aria-hidden="true">·</span>
          <span>기하 브라운 운동(GBM) · Box-Muller 정규난수</span>
        </div>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          같은 100만 원, 같은 투자전략이라도 결과는 달라집니다.
          <span className="text-[#1D4ED8]"> 한 번의 결과와 10,000번의 가능성을 비교해 보세요.</span>
        </h1>
      </section>

      {/* Two-Zone Sandbox: 1-5 Controls Left, 6-8 Charts & Comparison Right */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Steps 1~5 Controls */}
        <aside className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-4 space-y-6">
          {/* 1. 투자금 입력 */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <label htmlFor="quick-principal" className="text-sm font-semibold text-slate-900">
                1. 투자금 입력
              </label>
              <span className="font-mono text-xs font-semibold text-[#1D4ED8] tabular-nums">
                {fmtCompactKRW(params.principal)}
              </span>
            </div>

            <div className="relative">
              <input
                id="quick-principal"
                type="text"
                inputMode="numeric"
                value={inputText}
                onChange={(e) => handlePrincipalInputChange(e.target.value)}
                onBlur={handlePrincipalBlur}
                className="w-full min-h-[46px] rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 py-2 font-mono text-base font-semibold text-slate-900 tabular-nums focus:border-[#1D4ED8] focus:outline-2 focus:outline-[#1D4ED8]/20"
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-slate-500">
                원
              </span>
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
              {PRINCIPAL_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChangePrincipal(p.value)}
                  className={`min-h-[38px] rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    params.principal === p.value
                      ? 'border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {analyzedInitialCash >= QUICK_MIN_PRINCIPAL &&
              analyzedInitialCash !== params.principal && (
                <button
                  type="button"
                  onClick={() => onChangePrincipal(analyzedInitialCash)}
                  className="mt-2 w-full rounded-md border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-100/70"
                >
                  내 돈 분석 투자 가능액({fmtCompactKRW(analyzedInitialCash)}) 불러오기
                </button>
              )}
          </section>

          <hr className="border-slate-100" />

          {/* 2. 투자 성향 선택 + 기대수익률·변동성 가정 확인 및 수정 */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-900">2. 투자 성향 선택</span>
              {isCustomAssumptions && (
                <span className="text-xs font-semibold text-[#1D4ED8]">사용자 수정 중</span>
              )}
            </div>

            <div className="space-y-2" role="radiogroup" aria-label="투자 성향">
              {QUICK_PROFILE_ORDER.map((id) => {
                const preset = QUICK_RISK_PROFILES[id];
                const selected = params.profileId === id;
                const ret = selected ? params.annualReturn : preset.defaultAnnualReturn;
                const vol = selected ? params.annualVolatility : preset.defaultAnnualVolatility;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelectProfile(id)}
                    className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                      selected
                        ? 'border-[#1D4ED8] bg-blue-50/60'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-bold ${
                          selected ? 'text-[#1D4ED8]' : 'text-slate-900'
                        }`}
                      >
                        {preset.label}
                      </span>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        연 수익 {fmtPct(ret, 1)} · 변동성 {fmtPct(vol, 1)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{preset.shortDesc}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <button
                type="button"
                aria-expanded={assumptionsOpen}
                onClick={() => setAssumptionsOpen((v) => !v)}
                className="flex min-h-[40px] w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>기대수익률·변동성 가정 확인 및 수정</span>
                {assumptionsOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
                )}
              </button>

              {assumptionsOpen && (
                <div className="mt-2 space-y-3.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <label htmlFor="quick-mu" className="font-medium text-slate-700">
                        연 기대수익률 (μ)
                      </label>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {fmtPct(params.annualReturn, 1, true)}
                      </span>
                    </div>
                    <input
                      id="quick-mu"
                      type="range"
                      min={-10}
                      max={25}
                      step={0.5}
                      value={Number((params.annualReturn * 100).toFixed(1))}
                      onChange={(e) =>
                        onChangeAssumptions(Number(e.target.value) / 100, params.annualVolatility)
                      }
                      className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <label htmlFor="quick-sigma" className="font-medium text-slate-700">
                        연 변동성 (σ)
                      </label>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {fmtPct(params.annualVolatility, 1)}
                      </span>
                    </div>
                    <input
                      id="quick-sigma"
                      type="range"
                      min={1}
                      max={45}
                      step={0.5}
                      value={Number((params.annualVolatility * 100).toFixed(1))}
                      onChange={(e) =>
                        onChangeAssumptions(params.annualReturn, Number(e.target.value) / 100)
                      }
                      className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
                    />
                  </div>

                  {isCustomAssumptions && (
                    <button
                      type="button"
                      onClick={onResetAssumptions}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{currentPreset.label} 기본값 복원</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* 3. 투자 기간 선택 */}
          <section>
            <span className="mb-2 block text-sm font-semibold text-slate-900">
              3. 투자 기간 선택
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
              {QUICK_HORIZON_ORDER.map((hId) => {
                const h = QUICK_HORIZON_OPTIONS[hId];
                const active = params.horizonId === hId;
                return (
                  <button
                    key={hId}
                    type="button"
                    onClick={() => onSelectHorizon(hId)}
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">{h.label}</div>
                    <div className="font-mono text-[11px] opacity-80">{h.subLabel}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* 4 & 5. 실행 버튼 */}
          <section className="space-y-2.5">
            <button
              type="button"
              onClick={onRunSingle}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
            >
              <Dices className="h-4 w-4" aria-hidden="true" />
              <span>1회 투자 실행</span>
            </button>

            <button
              type="button"
              disabled={isRunningMc}
              onClick={onRunMonteCarlo}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-[#1D4ED8] bg-white px-4 py-3 text-sm font-semibold text-[#1D4ED8] transition-colors hover:bg-blue-50 disabled:opacity-60"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span>{isRunningMc ? '10,000회 계산 중...' : '10,000회 실행'}</span>
            </button>

            <p className="text-center text-[11px] text-slate-500">
              1회와 10,000회 실행 모두 동일한 수익률·변동성·기간 스텝을 사용합니다.
            </p>
          </section>
        </aside>

        {/* Steps 6~8 Visuals & Comparison */}
        <div className="space-y-6 lg:col-span-8">
          {/* 6. 미래 자산 그래프 + 1회 실행 결과 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                  6. 미래 자산 그래프 · 1회 주사위 실행 결과
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {QUICK_RISK_PROFILES[singleRun.profileId].label} ·{' '}
                  {QUICK_HORIZON_OPTIONS[singleRun.horizonId].label}(
                  {QUICK_HORIZON_OPTIONS[singleRun.horizonId].subLabel}) · 연 수익{' '}
                  {fmtPct(singleRun.annualReturn, 1)} · 연 변동성 {fmtPct(singleRun.annualVolatility, 1)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowBands((v) => !v)}
                  className={`min-h-[34px] rounded-lg border px-3 text-xs font-medium ${
                    showBands
                      ? 'border-[#1D4ED8]/30 bg-blue-50 text-[#1D4ED8]'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  10,000회 확률 범위 {showBands ? '표시' : '숨김'}
                </button>
                <button
                  type="button"
                  onClick={() => replayAnimation()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>경로 다시 재생</span>
                </button>
              </div>
            </div>

            {/* 4 Key Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 sm:grid-cols-4">
              <div>
                <span className="block text-xs text-slate-500">투자 원금</span>
                <span className="mt-1 block font-mono text-sm font-semibold text-slate-900 tabular-nums sm:text-base">
                  {fmtKRW(singleRun.principal)}
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-500">시뮬레이션 결과 자산</span>
                <span className="mt-1 block font-mono text-sm font-bold text-[#1D4ED8] tabular-nums sm:text-base">
                  {fmtKRW(singleRun.finalValue)}
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-500">손익금</span>
                <span
                  className={`mt-1 block font-mono text-sm font-semibold tabular-nums sm:text-base ${
                    isGain ? 'text-emerald-700' : isLoss ? 'text-rose-700' : 'text-slate-700'
                  }`}
                >
                  {fmtSignedKRW(singleRun.profitLoss)}
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-500">수익률</span>
                <span
                  className={`mt-1 inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums sm:text-base ${
                    isGain ? 'text-emerald-700' : isLoss ? 'text-rose-700' : 'text-slate-700'
                  }`}
                >
                  {isGain ? (
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  ) : isLoss ? (
                    <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{fmtPct(singleRun.returnRate, 2, true)}</span>
                </span>
              </div>
            </div>

            {/* Line Chart */}
            <div className="mt-3">
              <div className="mb-2 flex justify-between text-xs text-slate-500">
                <span>그래프 위를 가리키면 시점별 평가액을 확인합니다.</span>
                <span className="font-mono text-slate-800 tabular-nums">
                  {activePoint.label}: <strong>{fmtKRW(activePoint.value)}</strong>
                </span>
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                className="h-auto w-full touch-none select-none overflow-visible"
                role="img"
                aria-label="1회 주사위 실행 자산 변화 그래프"
                onMouseMove={(e) => handlePointerMove(e.clientX)}
                onMouseLeave={() => setHoverIdx(null)}
                onTouchMove={(e) => {
                  if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
                }}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                  const v = minVal + (maxVal - minVal) * t;
                  const y = toY(v);
                  return (
                    <g key={i}>
                      <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                      <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-500 font-mono text-[11px] tabular-nums">
                        {fmtCompactKRW(v)}
                      </text>
                    </g>
                  );
                })}

                {bands && band90Polygon && (
                  <>
                    <path d={band90Polygon} fill="#DBEAFE" fillOpacity="0.45" />
                    <path d={band50Polygon} fill="#93C5FD" fillOpacity="0.32" />
                    <path d={medianBandPath} fill="none" stroke="#334155" strokeWidth="1.4" strokeDasharray="3 3" />
                  </>
                )}

                <line
                  x1={padLeft}
                  y1={toY(singleRun.principal)}
                  x2={width - padRight}
                  y2={toY(singleRun.principal)}
                  stroke="#64748B"
                  strokeWidth="1.25"
                  strokeDasharray="5 4"
                />

                {areaPath && <path d={areaPath} fill="#1D4ED8" fillOpacity="0.08" />}
                <path d={linePath} fill="none" stroke="#1D4ED8" strokeWidth="2.5" strokeLinecap="round" />

                {visiblePoints.length > 0 && (
                  <circle
                    cx={toX(visiblePoints.length - 1)}
                    cy={toY(visiblePoints[visiblePoints.length - 1].value)}
                    r="4.5"
                    fill="#1D4ED8"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                )}

                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                  const idx = Math.round((points.length - 1) * t);
                  return (
                    <text
                      key={i}
                      x={toX(idx)}
                      y={height - 10}
                      textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}
                      className="fill-slate-500 font-mono text-[11px] tabular-nums"
                    >
                      {points[idx].label}
                    </text>
                  );
                })}
              </svg>
            </div>

            {recentRuns.length > 1 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <span className="block text-xs font-semibold text-slate-700">
                  최근 1회 실행 이력 비교 (동일 조건에서도 매번 달라집니다)
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {recentRuns.map((run, idx) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => onSelectHistoryRun(run)}
                      className={`rounded-lg border px-3 py-2 text-left ${
                        run.id === singleRun.id
                          ? 'border-[#1D4ED8] bg-blue-50/70'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{recentRuns.length - idx}번째 실행</span>
                        <span
                          className={`font-mono font-semibold ${
                            run.profitLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {fmtPct(run.returnRate, 1, true)}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold text-slate-900 tabular-nums">
                        {fmtKRW(run.finalValue)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 7. 예상 수익과 원금 손실 가능성 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              7. 예상 수익과 원금 손실 가능성 (10,000회 실행)
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                <span className="block text-xs text-slate-500">중앙값 최종 자산</span>
                <span className="mt-1 block font-mono text-base font-bold text-slate-900 tabular-nums">
                  {fmtKRW(monteCarlo.medianFinal)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                <span className="block text-xs text-slate-500">평균 최종 자산</span>
                <span className="mt-1 block font-mono text-base font-bold text-slate-900 tabular-nums">
                  {fmtKRW(monteCarlo.meanFinal)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-blue-50/50 p-3.5">
                <span className="block text-xs font-medium text-[#1D4ED8]">상위 5% 결과</span>
                <span className="mt-1 block font-mono text-base font-bold text-[#1D4ED8] tabular-nums">
                  {fmtKRW(monteCarlo.top5Final)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-rose-50/50 p-3.5">
                <span className="block text-xs font-medium text-rose-700">하위 5% 결과</span>
                <span className="mt-1 block font-mono text-base font-bold text-rose-700 tabular-nums">
                  {fmtKRW(monteCarlo.bottom5Final)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
                    <span>원금 손실 확률</span>
                  </span>
                  <span className="font-mono text-lg font-bold text-rose-700 tabular-nums">
                    {fmtPct(monteCarlo.lossProbability, 1)}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-rose-500"
                    style={{ width: `${Math.min(100, monteCarlo.lossProbability * 100)}%` }}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <CheckCircle2 className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                    <span>수익 발생 확률</span>
                  </span>
                  <span className="font-mono text-lg font-bold text-[#1D4ED8] tabular-nums">
                    {fmtPct(monteCarlo.profitProbability, 1)}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#1D4ED8]"
                    style={{ width: `${Math.min(100, monteCarlo.profitProbability * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 8. 1회 결과와 10,000회 분포 비교 히스토그램 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              8. 1회 결과와 10,000회 결과 분포 비교
            </h2>
            <div className="mt-2 flex min-h-[26px] items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              {hoveredBin ? (
                <span className="font-mono tabular-nums">
                  {fmtCompactKRW(hoveredBin.start)} ~ {fmtCompactKRW(hoveredBin.end)}:{' '}
                  <strong>
                    {hoveredBin.count.toLocaleString('ko-KR')}회 ({hoveredBin.percentage.toFixed(1)}%)
                  </strong>
                </span>
              ) : (
                <span>막대에 마우스·손가락을 올리면 10,000회 중 해당 구간 빈도를 확인할 수 있습니다.</span>
              )}
            </div>

            <svg
              viewBox={`0 0 ${width} ${histH}`}
              className="mt-2 h-auto w-full select-none overflow-visible"
              role="img"
              aria-label="10,000회 분포 히스토그램 위 직전 1회 결과 오버레이"
              onMouseLeave={() => setHoveredBinIdx(null)}
            >
              {bins.map((bin, idx) => {
                const x = hPadLeft + idx * barW + 1;
                const bw = Math.max(2, barW - 2);
                const bh = (bin.percentage / maxPct) * hPlotH;
                const y = hPadTop + hPlotH - bh;
                return (
                  <g
                    key={idx}
                    onMouseEnter={() => setHoveredBinIdx(idx)}
                    onTouchStart={() => setHoveredBinIdx(idx)}
                  >
                    <rect x={x} y={hPadTop} width={barW} height={hPlotH} fill="transparent" />
                    <rect
                      x={x}
                      y={y}
                      width={bw}
                      height={Math.max(1, bh)}
                      rx="2"
                      fill={bin.isLossBin ? '#FDA4AF' : '#3B82F6'}
                    />
                  </g>
                );
              })}

              {/* Principal Line */}
              <line
                x1={valToHistX(monteCarlo.principal)}
                y1={hPadTop}
                x2={valToHistX(monteCarlo.principal)}
                y2={hPadTop + hPlotH}
                stroke="#475569"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />

              {/* Single Run Overlay Marker */}
              <line
                x1={valToHistX(singleRun.finalValue)}
                y1={hPadTop - 6}
                x2={valToHistX(singleRun.finalValue)}
                y2={hPadTop + hPlotH}
                stroke="#D97706"
                strokeWidth="2.5"
              />
              <circle
                cx={valToHistX(singleRun.finalValue)}
                cy={hPadTop - 6}
                r="4.5"
                fill="#D97706"
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
              <text
                x={Math.max(hPadLeft + 50, Math.min(width - hPadRight - 50, valToHistX(singleRun.finalValue)))}
                y={hPadTop - 16}
                textAnchor="middle"
                className="fill-amber-700 text-[11px] font-bold"
              >
                직전 1회 결과 ({fmtCompactKRW(singleRun.finalValue)})
              </text>

              <text x={hPadLeft} y={histH - 10} textAnchor="start" className="fill-slate-500 font-mono text-[11px]">
                {fmtCompactKRW(minBin)}
              </text>
              <text x={width - hPadRight} y={histH - 10} textAnchor="end" className="fill-slate-500 font-mono text-[11px]">
                {fmtCompactKRW(maxBin)}
              </text>
            </svg>

            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-xs leading-relaxed text-slate-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
              <p>
                직전 1회 결과 <strong className="font-mono">{fmtKRW(singleRun.finalValue)}</strong>은(는) 10,000개 가능성 중{' '}
                <strong className="font-mono text-[#1D4ED8]">상위 {topRankPct.toFixed(1)}%</strong> 위치입니다. 한 번의 성공이나 실패가 전체 가능성을 대표하지 않습니다.
              </p>
            </div>
          </section>

          {/* 한계 및 가정 공개 */}
          <section className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p>
              <strong>가정 및 한계 공개:</strong> 본 간편 시뮬레이터는 실제 미래 주가를 맞히는 예측기가 아닌{' '}
              <strong>금융교육용 확률 시뮬레이션(기하 브라운 운동 · Box-Muller 정규난수 · 연속 복리)</strong>입니다. 수수료·세금·인플레이션 및 극단적 시장 충격은 반영되지 않으며, 로그인·서버 API 호출 없이 브라우저 내 JavaScript로만 100% 무료 실행됩니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
