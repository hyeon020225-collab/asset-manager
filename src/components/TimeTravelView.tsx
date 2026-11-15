import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Dice5,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';
import { INVESTOR_STYLES } from '../data/instruments';
import { buildRuleBasedExplanation } from '../engine/ruleAssistant';
import {
  CashflowAnalysis,
  CashflowInput,
  DataMode,
  MilestoneStats,
  PortfolioRecommendation,
  RiskEvaluationResult,
  SimulationMode,
  SimulationOutput,
} from '../types/wealth';
import { fmtCompactKRW, fmtKRW, fmtPct, fmtSignedKRW, profileLabel } from '../utils/formatters';

interface TimeTravelViewProps {
  cashflow: CashflowInput;
  analysis: CashflowAnalysis;
  riskEval: RiskEvaluationResult;
  portfolio: PortfolioRecommendation;
  simulation: SimulationOutput;
  simMode: SimulationMode;
  dataMode: DataMode;
  bootstrapBlockLength: number;
  stressScenario: boolean;
  constantRate: number;
  seed: number;
  isComputing: boolean;
  progress: { completed: number; total: number } | null;
  aiAvailable: boolean;
  onChangeSimMode: (mode: SimulationMode) => void;
  onChangeBlockLength: (len: number) => void;
  onToggleStress: (stress: boolean) => void;
  onChangeConstantRate: (rate: number) => void;
  onChangeSeed: (seed: number) => void;
  onRunNewMonteCarlo: (newSeed: number) => void;
  onCancelComputation: () => void;
  onSelectPathIndex: (idx: number) => void;
}

interface ScenarioSnapshot {
  label: string;
  styleName: string;
  profileName: string;
  monthlyInvest: number;
  horizonYears: number;
  medianEnd: number;
  p5End: number;
  lossProb: number;
  targetProb: number;
}

export function TimeTravelView({
  cashflow,
  analysis,
  riskEval,
  portfolio,
  simulation,
  simMode,
  dataMode,
  bootstrapBlockLength,
  stressScenario,
  constantRate,
  seed,
  isComputing,
  progress,
  aiAvailable,
  onChangeSimMode,
  onChangeBlockLength,
  onToggleStress,
  onChangeConstantRate,
  onChangeSeed,
  onRunNewMonteCarlo,
  onCancelComputation,
  onSelectPathIndex,
}: TimeTravelViewProps) {
  const [useRealValue, setUseRealValue] = useState(false);
  const [showConstantLine, setShowConstantLine] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(simulation.totalMonths);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5>(2);
  const [snapshot, setSnapshot] = useState<ScenarioSnapshot | null>(null);
  const [aiPayloadOpen, setAiPayloadOpen] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setCurrentMonth(simulation.totalMonths);
    setIsPlaying(false);
    setAiExplanation(null);
  }, [simulation.seed, simulation.selectedPathIndex, simulation.totalMonths, simulation.mode]);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCurrentMonth(simulation.totalMonths);
      setIsPlaying(false);
      return;
    }

    const stepMonths = speed === 1 ? 1 : speed === 2 ? 3 : 6;
    timerRef.current = window.setInterval(() => {
      setCurrentMonth((prev) => {
        if (prev + stepMonths >= simulation.totalMonths) {
          setIsPlaying(false);
          return simulation.totalMonths;
        }
        return prev + stepMonths;
      });
    }, 65);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, simulation.totalMonths]);

  const handlePlayReplay = () => {
    if (currentMonth >= simulation.totalMonths) {
      setCurrentMonth(0);
    }
    setIsPlaying(true);
  };

  // Current selected path point at currentMonth
  const currentPoint =
    simulation.selectedPath[Math.min(currentMonth, simulation.selectedPath.length - 1)] ??
    simulation.selectedPath[0];

  // SVG Fan Chart Geometry
  const width = 800;
  const height = 340;
  const padLeft = 78;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { maxVal } = useMemo(() => {
    let max = Math.max(cashflow.targetAmount, analysis.appliedInitialInvestment * 1.2, 1_000_000);
    for (const pt of simulation.fanSeries) {
      const top = useRealValue
        ? pt.p95 / Math.pow(1 + cashflow.annualInflationRate, pt.monthIndex / 12)
        : pt.p95;
      if (top > max) max = top;
      if (showConstantLine && pt.constantBenchmark > max) max = pt.constantBenchmark;
    }
    for (const pt of simulation.selectedPath) {
      const v = useRealValue ? pt.realBalance : pt.nominalBalance;
      if (v > max) max = v;
    }
    return { maxVal: max * 1.06 };
  }, [simulation, useRealValue, showConstantLine, cashflow, analysis.appliedInitialInvestment]);

  const toX = (mIdx: number) =>
    padLeft + (mIdx / Math.max(1, simulation.totalMonths)) * plotW;
  const toY = (val: number) => {
    const ratio = Math.max(0, Math.min(1, val / Math.max(1, maxVal)));
    return padTop + plotH - ratio * plotH;
  };

  const deflatorAt = (mIdx: number) =>
    useRealValue ? Math.pow(1 + cashflow.annualInflationRate, mIdx / 12) : 1;

  const buildBandPolygon = (upperKey: 'p95' | 'p75', lowerKey: 'p5' | 'p25') => {
    if (simulation.fanSeries.length === 0) return '';
    const up = simulation.fanSeries.map(
      (pt) => `${toX(pt.monthIndex).toFixed(1)},${toY(pt[upperKey] / deflatorAt(pt.monthIndex)).toFixed(1)}`
    );
    const lo = [...simulation.fanSeries]
      .reverse()
      .map(
        (pt) => `${toX(pt.monthIndex).toFixed(1)},${toY(pt[lowerKey] / deflatorAt(pt.monthIndex)).toFixed(1)}`
      );
    return `M${up.join(' L')} L${lo.join(' L')} Z`;
  };

  const medianLine = simulation.fanSeries
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'}${toX(pt.monthIndex).toFixed(1)},${toY(
          pt.p50 / deflatorAt(pt.monthIndex)
        ).toFixed(1)}`
    )
    .join(' ');

  const constantLine = simulation.fanSeries
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'}${toX(pt.monthIndex).toFixed(1)},${toY(
          pt.constantBenchmark / deflatorAt(pt.monthIndex)
        ).toFixed(1)}`
    )
    .join(' ');

  const visibleSelectedPath = simulation.selectedPath.filter((p) => p.monthIndex <= currentMonth);
  const selectedLine = visibleSelectedPath
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'}${toX(pt.monthIndex).toFixed(1)},${toY(
          useRealValue ? pt.realBalance : pt.nominalBalance
        ).toFixed(1)}`
    )
    .join(' ');

  const targetY = toY(cashflow.targetAmount / deflatorAt(simulation.totalMonths));

  const ruleExplanation = useMemo(
    () => buildRuleBasedExplanation(analysis, riskEval, portfolio, simulation),
    [analysis, riskEval, portfolio, simulation]
  );

  const structuredPayloadForAi = useMemo(
    () => ({
      appliedProfile: profileLabel(riskEval.appliedProfile),
      investorStyle: INVESTOR_STYLES[portfolio.styleId].name,
      initialInvestmentKRW: Math.round(analysis.appliedInitialInvestment),
      monthlyInvestmentKRW: Math.round(analysis.appliedMonthlyInvestment),
      horizonYears: simulation.horizonYears,
      medianEndingKRW: Math.round(simulation.milestones.horizonEnd.nominalMedian),
      realMedianEndingKRW: Math.round(simulation.milestones.horizonEnd.realMedian),
      downside5PctKRW: Math.round(simulation.milestones.horizonEnd.nominalP5),
      lossVsPrincipalProbPct: Number((simulation.milestones.horizonEnd.lossVsNetPrincipalProb * 100).toFixed(1)),
      targetAchievedProbPct: Number((simulation.milestones.horizonEnd.targetAchievedProb * 100).toFixed(1)),
    }),
    [analysis, riskEval, portfolio, simulation]
  );

  const requestAiExplanation = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: structuredPayloadForAi }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiExplanation(data.explanation || ruleExplanation);
      } else {
        setAiExplanation(null);
      }
    } catch {
      setAiExplanation(null);
    } finally {
      setAiLoading(false);
    }
  };

  const milestonesList: MilestoneStats[] = [
    simulation.milestones.oneYear,
    simulation.milestones.tenYear,
    simulation.milestones.horizonEnd,
  ].filter((m): m is MilestoneStats => m !== null);

  const saveSnapshot = () => {
    const end = simulation.milestones.horizonEnd;
    setSnapshot({
      label: `${profileLabel(riskEval.appliedProfile)} · ${INVESTOR_STYLES[portfolio.styleId].name}`,
      styleName: INVESTOR_STYLES[portfolio.styleId].name,
      profileName: profileLabel(riskEval.appliedProfile),
      monthlyInvest: analysis.appliedMonthlyInvestment,
      horizonYears: simulation.horizonYears,
      medianEnd: end.nominalMedian,
      p5End: end.nominalP5,
      lossProb: end.lossVsNetPrincipalProb,
      targetProb: end.targetAchievedProb,
    });
  };

  return (
    <div className="space-y-6">
      {/* Simulation Mode, Seed, Stress & Constant Comparison Controls */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              시간 여행 시뮬레이션 (실제 10,000개 월별 경로)
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              실행 횟수 제한·로그인·API 과금 없이 로컬 Web Worker에서 10,000개의 미래를 계산합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isComputing ? (
              <button
                type="button"
                onClick={onCancelComputation}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  계산 취소 ({progress ? `${progress.completed.toLocaleString()}/${progress.total.toLocaleString()}` : '실행 중'})
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRunNewMonteCarlo(Math.floor(Math.random() * 900_000) + 100_000)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <Dice5 className="h-4 w-4" aria-hidden="true" />
                <span>새 Seed로 10,000회 다시 계산</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Engine Mode */}
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">계산 모형 선택</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => onChangeSimMode('parametric')}
                className={`min-h-[34px] rounded-md px-2 text-xs font-semibold ${
                  simMode === 'parametric' ? 'bg-white text-[#1D4ED8] shadow-xs' : 'text-slate-600'
                }`}
              >
                A. 모수 몬테카를로
              </button>
              <button
                type="button"
                onClick={() => onChangeSimMode('bootstrap')}
                className={`min-h-[34px] rounded-md px-2 text-xs font-semibold ${
                  simMode === 'bootstrap' ? 'bg-white text-[#1D4ED8] shadow-xs' : 'text-slate-600'
                }`}
              >
                B. 블록 부트스트랩
              </button>
            </div>
            {simMode === 'bootstrap' && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600">
                <span>연속 블록 길이(개월):</span>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={bootstrapBlockLength}
                  onChange={(e) => onChangeBlockLength(Math.max(1, Math.min(36, Number(e.target.value) || 12)))}
                  className="w-16 rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs tabular-nums"
                />
              </div>
            )}
          </div>

          {/* Nominal vs Real & Stress */}
          <div className="space-y-2">
            <span className="block text-[11px] font-semibold text-slate-600">금액 표시 · 스트레스</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUseRealValue((v) => !v)}
                className={`min-h-[36px] flex-1 rounded-lg border px-2.5 text-xs font-semibold ${
                  useRealValue
                    ? 'border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {useRealValue ? '물가반영 현재가치' : '명목 원화 금액'}
              </button>
              <button
                type="button"
                onClick={() => onToggleStress(!stressScenario)}
                className={`min-h-[36px] flex-1 rounded-lg border px-2.5 text-xs font-semibold ${
                  stressScenario
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {stressScenario ? '스트레스 적용 중' : '스트레스 가정 끄기'}
              </button>
            </div>
          </div>

          {/* Constant Compound Comparison (Strictly Separate!) */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
              <span>일정 수익률 가정 비교 (별도 보기)</span>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showConstantLine}
                  onChange={(e) => setShowConstantLine(e.target.checked)}
                  className="accent-[#1D4ED8]"
                />
                <span>표시</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">연</span>
              <input
                type="number"
                min={0}
                max={30}
                step={1}
                value={Math.round(constantRate * 100)}
                onChange={(e) => onChangeConstantRate((Number(e.target.value) || 0) / 100)}
                className="w-20 min-h-[36px] rounded-md border border-slate-300 px-2 font-mono text-xs tabular-nums"
              />
              <span className="text-xs text-slate-500">% 복리 비교선</span>
            </div>
          </div>

          {/* Reproducible Seed & Path Index */}
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">
              재현용 Seed · 경로 번호 (#{simulation.selectedPathIndex + 1})
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={seed}
                onChange={(e) => onChangeSeed(Number(e.target.value) || 1)}
                className="w-28 min-h-[36px] rounded-md border border-slate-300 px-2 font-mono text-xs tabular-nums"
              />
              <button
                type="button"
                onClick={() =>
                  onSelectPathIndex(Math.floor(Math.random() * simulation.runCount))
                }
                className="min-h-[36px] flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                다른 미래 경로 보기
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Center Stage: Time Travel Player & Fan Chart */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        {/* Time Travel Playback Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (isPlaying ? setIsPlaying(false) : handlePlayReplay())}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>일시정지</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{currentMonth >= simulation.totalMonths ? '같은 미래 경로 다시 보기' : '재생'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentMonth(0);
              }}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>처음으로</span>
            </button>

            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {([1, 2, 5] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setSpeed(sp)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold ${
                    speed === sp ? 'bg-white text-[#1D4ED8] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {simulation.totalMonths >= 12 && (
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentMonth(12);
                }}
                className="min-h-[34px] rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                1년 후
              </button>
            )}
            {simulation.totalMonths >= 120 && (
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentMonth(120);
                }}
                className="min-h-[34px] rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                10년 후
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentMonth(simulation.totalMonths);
              }}
              className="min-h-[34px] rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              은퇴 시점 ({cashflow.retireAge}세)
            </button>
          </div>
        </div>

        {/* Time Slider + Live Clock & Age */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-mono font-bold text-slate-900 tabular-nums">
              경과 {currentMonth}개월 ({(currentMonth / 12).toFixed(1)}년) · 현재 나이{' '}
              <span className="text-[#1D4ED8]">{currentPoint?.age.toFixed(1)}세</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-700">
              <span>
                투자계좌 평가액:{' '}
                <strong className="text-slate-900">
                  {fmtKRW(
                    currentPoint
                      ? useRealValue
                        ? currentPoint.realBalance
                        : currentPoint.nominalBalance
                      : 0
                  )}
                </strong>
              </span>
              <span>
                순투입 원금: <strong>{fmtKRW(currentPoint?.netContributed ?? 0)}</strong>
              </span>
              <span>
                단위기준가 TWR:{' '}
                <strong className={currentPoint && currentPoint.unitNav >= 1 ? 'text-emerald-700' : 'text-rose-700'}>
                  {fmtPct((currentPoint?.unitNav ?? 1) - 1, 1, true)}
                </strong>
              </span>
              <span>
                현재 낙폭: <strong className="text-rose-700">-{fmtPct(currentPoint?.drawdown ?? 0, 1)}</strong>
              </span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={simulation.totalMonths}
            value={currentMonth}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentMonth(Number(e.target.value));
            }}
            aria-label="시간 여행 월별 슬라이더"
            className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
          />

          {currentPoint?.signalLabel && (
            <div className="text-xs font-medium text-[#1D4ED8]">
              이 시점 드러켄밀러 참고 모형 신호(t-1 직전 기준): {currentPoint.signalLabel}
            </div>
          )}
          {currentPoint && currentPoint.shortfallAmount > 0 && (
            <div className="text-xs font-semibold text-rose-700">
              자금 부족 발생: 예정 인출액 중 {fmtKRW(currentPoint.shortfallAmount)}이 계좌 잔액 부족으로 충당되지 못했습니다.
            </div>
          )}
        </div>

        {/* SVG Fan Chart */}
        <div className="w-full">
          <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-xs bg-blue-100" />
              <span>모형 내 5~95백분위 분포 (미래 보장 신뢰구간 아님)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t border-dashed border-slate-700" />
              <span>10,000회 중앙값 (50백분위)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-[#1D4ED8]" />
              <span>선택 경로 #{simulation.selectedPathIndex + 1} (실제 1개 경로)</span>
            </span>
            {showConstantLine && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t border-dotted border-amber-600" />
                <span>연 {Math.round(constantRate * 100)}% 일정 복리 가정</span>
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full select-none overflow-visible"
            role="img"
            aria-label="투자계좌 자산 분포 팬 차트 및 시간 여행 경로"
          >
            {/* Y Grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
              const v = maxVal * t;
              const y = toY(v);
              return (
                <g key={i}>
                  <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[11px] tabular-nums"
                  >
                    {fmtCompactKRW(v)}
                  </text>
                </g>
              );
            })}

            {/* Fan Bands */}
            <path d={buildBandPolygon('p95', 'p5')} fill="#DBEAFE" fillOpacity="0.45" />
            <path d={buildBandPolygon('p75', 'p25')} fill="#93C5FD" fillOpacity="0.35" />

            {/* Target Goal Line */}
            <line
              x1={padLeft}
              y1={targetY}
              x2={width - padRight}
              y2={targetY}
              stroke="#059669"
              strokeWidth="1.25"
              strokeDasharray="5 4"
            />
            <text x={width - padRight} y={targetY - 5} textAnchor="end" className="fill-emerald-700 text-[10px] font-semibold">
              목표 {fmtCompactKRW(cashflow.targetAmount)}
            </text>

            {/* Median Dashed Line */}
            <path d={medianLine} fill="none" stroke="#334155" strokeWidth="1.75" strokeDasharray="4 3" />

            {/* Constant Benchmark Line (Optional) */}
            {showConstantLine && (
              <path d={constantLine} fill="none" stroke="#D97706" strokeWidth="1.75" strokeDasharray="2 3" />
            )}

            {/* Selected Single Path up to currentMonth */}
            <path d={selectedLine} fill="none" stroke="#1D4ED8" strokeWidth="2.5" strokeLinecap="round" />

            {currentPoint && (
              <circle
                cx={toX(currentPoint.monthIndex)}
                cy={toY(useRealValue ? currentPoint.realBalance : currentPoint.nominalBalance)}
                r="5"
                fill="#1D4ED8"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            )}

            {/* X-axis Age ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
              const m = Math.round(simulation.totalMonths * t);
              const age = Math.round(cashflow.currentAge + m / 12);
              return (
                <text
                  key={i}
                  x={toX(m)}
                  y={height - 10}
                  textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}
                  className="fill-slate-500 font-mono text-[11px] tabular-nums"
                >
                  {age}세 ({Math.round(m / 12)}년)
                </text>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <span>
            모형: {simulation.modelVersion} · 데이터 모드: {dataMode} · 실행: {simulation.runCount.toLocaleString()}회 (Seed {simulation.seed}) · 연산시간 {simulation.elapsedMs}ms
          </span>
          <span className="font-mono tabular-nums">
            원금 미만 비율 몬테카를로 표준오차 ±{(simulation.monteCarloSeAtLossProb * 100).toFixed(2)}%p
          </span>
        </div>
      </section>

      {/* 1 Year / 10 Year / Retirement Milestones Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              시점별 투자계좌 평가액 및 위험 지표 (1년 · 10년 · 은퇴 시점)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              표시되는 평가액은 입력하지 않은 국민연금·주택가치를 합산하지 않은 순수 투자계좌 기준(비용 반영, 세전)입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={saveSnapshot}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>현재 조건을 비교 기준(A)으로 저장</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">구분 ({useRealValue ? '현재 구매력 기준' : '명목 원화 기준'})</th>
                {milestonesList.map((m) => (
                  <th key={m.monthIndex} className="py-2 px-3 text-right font-semibold text-slate-800">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">총 납입액 (평균)</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-slate-700">
                    {fmtKRW(m.totalContributedMean)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">총 인출액 (평균)</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-slate-700">
                    {fmtKRW(m.totalWithdrawnMean)}
                  </td>
                ))}
              </tr>
              <tr className="bg-blue-50/40">
                <td className="py-2 pr-3 font-sans font-bold text-[#1D4ED8]">중앙값 (50백분위) 평가액</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right font-bold text-[#1D4ED8]">
                    {fmtKRW(useRealValue ? m.realMedian : m.nominalMedian)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">평균 평가액</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-slate-900">
                    {fmtKRW(useRealValue ? m.realMean : m.nominalMean)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">중앙값 투자손익 (납입원금 제외 순수익)</td>
                {milestonesList.map((m) => (
                  <td
                    key={m.monthIndex}
                    className={`py-2 px-3 text-right font-semibold ${
                      m.medianProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {fmtSignedKRW(m.medianProfit)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">하위 5% ~ 상위 5% 범위 (모형 내 분포)</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-slate-600">
                    {fmtCompactKRW(useRealValue ? m.realP5 : m.nominalP5)} ~{' '}
                    {fmtCompactKRW(useRealValue ? m.realP95 : m.nominalP95)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">25% ~ 75% (중간 절반 범위)</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-slate-600">
                    {fmtCompactKRW(m.nominalP25)} ~ {fmtCompactKRW(m.nominalP75)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">순투입 원금 미만 비율 / 목표 달성 비율</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right">
                    <span className="text-rose-700">{fmtPct(m.lossVsNetPrincipalProb, 1)}</span>
                    {' / '}
                    <span className="text-emerald-700">{fmtPct(m.targetAchievedProb, 1)}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">손실 예산 초과 비율</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-rose-700">
                    {fmtPct(m.lossBudgetExceededProb, 1)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">투자 도중 최대낙폭 (중앙 / 최악 5%)</td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-slate-700">
                    -{fmtPct(m.maxDrawdownMedian, 1)} / -{fmtPct(m.maxDrawdownP95Worst, 1)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-sans font-medium text-amber-800">
                  [별도 참고] 연 {Math.round(constantRate * 100)}% 일정 복리 가정 시
                </td>
                {milestonesList.map((m) => (
                  <td key={m.monthIndex} className="py-2 px-3 text-right text-amber-800">
                    {fmtKRW(m.constantReturnBenchmarkValue)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Scenario A vs B Comparison */}
        {snapshot && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-xs">
            <div className="font-bold text-slate-900">저장한 기준(A) vs 현재 조건(B) 비교</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 font-mono tabular-nums">
              <div className="rounded-md bg-white p-3 border border-slate-200">
                <div className="font-sans font-semibold text-slate-700">기준 A: {snapshot.label}</div>
                <div className="mt-1">월 적립 {fmtKRW(snapshot.monthlyInvest)} · 중앙 평가액 {fmtKRW(snapshot.medianEnd)}</div>
                <div>하위 5%: {fmtKRW(snapshot.p5End)} · 목표 달성 {fmtPct(snapshot.targetProb, 1)}</div>
              </div>
              <div className="rounded-md bg-white p-3 border border-[#1D4ED8]">
                <div className="font-sans font-semibold text-[#1D4ED8]">
                  현재 B: {profileLabel(riskEval.appliedProfile)} · {INVESTOR_STYLES[portfolio.styleId].name}
                </div>
                <div className="mt-1">
                  월 적립 {fmtKRW(analysis.appliedMonthlyInvestment)} · 중앙 평가액{' '}
                  {fmtKRW(simulation.milestones.horizonEnd.nominalMedian)}
                </div>
                <div>
                  하위 5%: {fmtKRW(simulation.milestones.horizonEnd.nominalP5)} · 목표 달성{' '}
                  {fmtPct(simulation.milestones.horizonEnd.targetAchievedProb, 1)}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Rule-based vs Optional Server Gemini AI Explanation */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-900">
              결과 해석 ({aiExplanation ? '실시간 Gemini AI 설명' : '규칙 기반 계산 설명'})
            </h2>
          </div>

          {aiAvailable && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAiPayloadOpen((v) => !v)}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                {aiPayloadOpen ? '전송 범위 닫기' : '전송할 정보 확인'}
              </button>
              <button
                type="button"
                disabled={aiLoading}
                onClick={requestAiExplanation}
                className="rounded-lg border border-[#1D4ED8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-50 disabled:opacity-50"
              >
                {aiLoading ? 'AI 설명 생성 중...' : '확인 후 Gemini AI 해설 요청'}
              </button>
            </div>
          )}
        </div>

        {aiPayloadOpen && (
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
            {JSON.stringify(structuredPayloadForAi, null, 2)}
          </pre>
        )}

        <p className="text-xs leading-relaxed text-slate-700 sm:text-sm">
          {aiExplanation ?? ruleExplanation}
        </p>
      </section>
    </div>
  );
}
