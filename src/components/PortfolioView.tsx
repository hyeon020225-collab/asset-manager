import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ASSET_CLASS_ORDER,
  INSTRUMENT_CANDIDATES,
  INVESTOR_STYLES,
  QUALITY_STOCK_CRITERIA,
} from '../data/instruments';
import { buildPortfolioRecommendation, normalizeWeights } from '../engine/portfolio';
import { runWealthSimulation } from '../engine/simulator';
import {
  AssetClassId,
  AssetClassSpec,
  CashflowAnalysis,
  CashflowInput,
  InvestorStyleId,
  PortfolioRecommendation,
  RiskAssessmentInput,
  RiskEvaluationResult,
  RiskProfileId,
} from '../types/wealth';
import { fmtKRW, fmtPct, profileLabel } from '../utils/formatters';

interface PortfolioViewProps {
  cashflow: CashflowInput;
  analysis: CashflowAnalysis;
  riskInput: RiskAssessmentInput;
  riskEval: RiskEvaluationResult;
  styleId: InvestorStyleId;
  customWeights: Record<AssetClassId, number> | null;
  portfolio: PortfolioRecommendation;
  assetSpecs: Record<AssetClassId, AssetClassSpec>;
  seed: number;
  onChangeRiskInput: (next: RiskAssessmentInput) => void;
  onSelectStyle: (styleId: InvestorStyleId) => void;
  onChangeCustomWeights: (weights: Record<AssetClassId, number> | null) => void;
  onGoSimulation: () => void;
}

const STYLE_ORDER: InvestorStyleId[] = [
  'balanced_core',
  'buffett',
  'lynch',
  'druckenmiller',
];

function fitBadgeClass(grade: '적합' | '보통' | '주의'): string {
  if (grade === '적합') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (grade === '보통') return 'border-blue-200 bg-blue-50 text-[#1D4ED8]';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

export function PortfolioView({
  cashflow,
  analysis,
  riskInput,
  riskEval,
  styleId,
  customWeights,
  portfolio,
  assetSpecs,
  seed,
  onChangeRiskInput,
  onSelectStyle,
  onChangeCustomWeights,
  onGoSimulation,
}: PortfolioViewProps) {
  const [donutMode, setDonutMode] = useState<'asset' | 'holding'>('asset');
  const [selectedSliceIdx, setSelectedSliceIdx] = useState<number>(0);
  const [editingWeights, setEditingWeights] = useState(false);

  const selectedStyleMeta = INVESTOR_STYLES[styleId];
  const horizonYears = Math.max(1, cashflow.retireAge - cashflow.currentAge);

  // Run fast 400-path live preview with identical inputs/seed so summary metrics are always real & synced
  const quickSummary = useMemo(() => {
    const lossRatio =
      riskInput.lossBudgetReferenceCapital > 0
        ? riskInput.lossBudgetMaxAmount / riskInput.lossBudgetReferenceCapital
        : 0.1;
    return runWealthSimulation({
      cashflow,
      analysis,
      portfolio,
      assetSpecs,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 400,
      seed,
      lossBudgetRatio: lossRatio,
    });
  }, [cashflow, analysis, portfolio, assetSpecs, seed, riskInput]);

  // Same-seed comparison across all 4 styles (capped inside current risk profile)
  const styleComparisons = useMemo(() => {
    const lossRatio =
      riskInput.lossBudgetReferenceCapital > 0
        ? riskInput.lossBudgetMaxAmount / riskInput.lossBudgetReferenceCapital
        : 0.1;
    return STYLE_ORDER.map((sId) => {
      const rec = buildPortfolioRecommendation(
        riskEval.appliedProfile,
        sId,
        cashflow,
        analysis,
        riskInput,
        assetSpecs,
        null
      );
      const sim = runWealthSimulation({
        cashflow,
        analysis,
        portfolio: rec,
        assetSpecs,
        mode: 'parametric',
        dataMode: 'dev_assumption',
        runCount: 300,
        seed,
        lossBudgetRatio: lossRatio,
      });
      return { styleId: sId, rec, sim };
    });
  }, [riskEval.appliedProfile, cashflow, analysis, riskInput, assetSpecs, seed]);

  // Build Donut Slices
  const slices = useMemo(() => {
    return portfolio.holdings.map((h) => ({
      id: h.instrumentId,
      label: donutMode === 'asset' ? assetSpecs[h.assetClass].label : `${h.name} (${h.ticker})`,
      assetClass: h.assetClass,
      weightPct: h.weightPct,
      amountKRW: h.amountKRW,
      color: h.color,
      riskSummary: assetSpecs[h.assetClass].riskSummary,
      asOfDate: assetSpecs[h.assetClass].asOfDate,
    }));
  }, [portfolio.holdings, donutMode, assetSpecs]);

  const activeSlice = slices[Math.min(selectedSliceIdx, Math.max(0, slices.length - 1))] ?? null;

  // SVG Donut Geometry
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  let cumulativePct = 0;

  const endStats = quickSummary.milestones.horizonEnd;
  const oneYearStats = quickSummary.milestones.oneYear ?? endStats;

  const handleSliderWeight = (assetId: AssetClassId, newPct: number) => {
    const clamped = Math.max(0, Math.min(100, newPct)) / 100;
    const base = { ...portfolio.assetWeights };
    const oldVal = base[assetId];
    const remainingOld = 1 - oldVal;
    const remainingNew = 1 - clamped;
    const next = { ...base, [assetId]: clamped };

    for (const k of ASSET_CLASS_ORDER) {
      if (k === assetId) continue;
      if (remainingOld > 0.0001) {
        next[k] = (base[k] / remainingOld) * remainingNew;
      } else {
        next[k] = remainingNew / (ASSET_CLASS_ORDER.length - 1);
      }
    }
    onChangeCustomWeights(normalizeWeights(next));
  };

  return (
    <div className="space-y-6">
      {/* Dual Risk Evaluation: Psychological Willingness vs Objective Capacity */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              성향(위험 선호)과 실제 손실 감당 능력(재무 여건) 평가
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              마음으로는 고수익을 원해도 비상자금·부채·소득 안정성 여건이 뒷받침되지 않으면 실제 감당 가능 한도에 맞춰 위험을 제한합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
              심리 의사: {riskEval.willingnessScore}점 ({profileLabel(riskEval.willingnessProfile)})
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
              감당 능력: {riskEval.capacityScore}점 ({profileLabel(riskEval.capacityProfile)})
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left: Willingness & Loss Budget Inputs */}
          <div className="space-y-4 lg:col-span-6">
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                <label htmlFor="loss-reaction">투자 자산이 -20% 하락했을 때 반응</label>
                <span className="font-mono text-[#1D4ED8]">{riskInput.lossReactionScore} / 5</span>
              </div>
              <input
                id="loss-reaction"
                type="range"
                min={1}
                max={5}
                step={1}
                value={riskInput.lossReactionScore}
                onChange={(e) =>
                  onChangeRiskInput({ ...riskInput, lossReactionScore: Number(e.target.value) })
                }
                className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                <span>1: 즉시 전액 매도</span>
                <span>3: 유지하며 관망</span>
                <span>5: 추가 매수 고려</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="inv-exp" className="mb-1 block text-xs font-semibold text-slate-700">
                  투자 경험
                </label>
                <select
                  id="inv-exp"
                  value={riskInput.experience}
                  onChange={(e) =>
                    onChangeRiskInput({
                      ...riskInput,
                      experience: e.target.value as RiskAssessmentInput['experience'],
                    })
                  }
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
                >
                  <option value="none">예·적금 위주 (투자 경험 거의 없음)</option>
                  <option value="basic">ETF·주식 소액 경험 있음</option>
                  <option value="experienced">상승·하락 사이클 경험 있음</option>
                </select>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                  <label htmlFor="vol-pref">변동성 감내 의사</label>
                  <span className="font-mono text-[#1D4ED8]">{riskInput.volatilityPreferenceScore} / 5</span>
                </div>
                <input
                  id="vol-pref"
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={riskInput.volatilityPreferenceScore}
                  onChange={(e) =>
                    onChangeRiskInput({
                      ...riskInput,
                      volatilityPreferenceScore: Number(e.target.value),
                    })
                  }
                  className="mt-2 h-2 w-full cursor-pointer accent-[#1D4ED8]"
                />
              </div>
            </div>

            {/* Loss Budget Input (Not a cap or guarantee!) */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <span className="block text-xs font-semibold text-slate-800">
                내가 감당할 수 있다고 느끼는 손실 기준 입력 (손실 보장·상한 아님)
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">기준 투자액 (원)</label>
                  <input
                    type="number"
                    min={100_000}
                    step={1_000_000}
                    value={riskInput.lossBudgetReferenceCapital}
                    onChange={(e) =>
                      onChangeRiskInput({
                        ...riskInput,
                        lossBudgetReferenceCapital: Math.max(100_000, Number(e.target.value) || 1_000_000),
                      })
                    }
                    className="w-full min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">감당 가능 손실액 (원)</label>
                  <input
                    type="number"
                    min={0}
                    step={100_000}
                    value={riskInput.lossBudgetMaxAmount}
                    onChange={(e) =>
                      onChangeRiskInput({
                        ...riskInput,
                        lossBudgetMaxAmount: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs tabular-nums"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-600">
                모형에서 1년 뒤 이 기준(
                <strong className="font-mono">
                  -{((riskInput.lossBudgetMaxAmount / Math.max(1, riskInput.lossBudgetReferenceCapital)) * 100).toFixed(1)}%
                </strong>
                )보다 더 큰 손실이 나온 비율:{' '}
                <strong className="font-mono text-rose-700">
                  {fmtPct(oneYearStats.lossBudgetExceededProb, 1)}
                </strong>
                {' '}(실제 손실 상한 보장이 아니며 초과 가능성도 존재함)
              </p>
            </div>
          </div>

          {/* Right: Recommended Profile, Override & Reasoning */}
          <div className="space-y-4 lg:col-span-6">
            <div>
              <span className="mb-2 block text-xs font-semibold text-slate-700">
                적용 성향 선택 (자동 권고: {profileLabel(riskEval.recommendedProfile)})
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['conservative', 'moderate', 'aggressive'] as RiskProfileId[]).map((pId) => {
                  const active = riskEval.appliedProfile === pId;
                  return (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => {
                        onChangeCustomWeights(null);
                        onChangeRiskInput({ ...riskInput, userProfileOverride: pId });
                      }}
                      className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {profileLabel(pId)}
                      {riskEval.recommendedProfile === pId && ' (권고)'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2">
              <div className="text-xs font-bold text-slate-900">성향 분류 및 조정 근거</div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600">
                {riskEval.reasons.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>

            {!portfolio.candidateSatisfiesLossBudget && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div className="space-y-1">
                  <strong>설정한 손실 예산 초과 가능성 알림</strong>
                  {portfolio.adjustmentSuggestions.map((s, i) => (
                    <p key={i}>• {s}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3-1. Investor Style Selection Cards */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              어떤 투자자의 원칙을 참고할까요?
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              선택한 스타일은 후보 선정·자산 비중·리밸런싱 주기에 실제 차이를 만들며, 위에서 정한 성향({profileLabel(riskEval.appliedProfile)})의 위험 한도를 넘지 않도록 조정됩니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STYLE_ORDER.map((sId) => {
            const meta = INVESTOR_STYLES[sId];
            const active = styleId === sId;
            return (
              <button
                key={sId}
                type="button"
                onClick={() => {
                  onChangeCustomWeights(null);
                  onSelectStyle(sId);
                }}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-[#1D4ED8] bg-blue-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                        active ? 'bg-[#1D4ED8] text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {meta.badgeInitials}
                    </span>
                    <span className={`text-sm font-bold ${active ? 'text-[#1D4ED8]' : 'text-slate-900'}`}>
                      {meta.name}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-slate-600">{meta.tagline}</p>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500">
                  {meta.rebalanceLabel}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Style Summary Card (Exact 1-5 Elements) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-6">
          {/* 1. 투자자명과 전략 설명 + 2. 단기/중기/장기 적합도 배지 */}
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start">
            <div className="max-w-2xl space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                  {selectedStyleMeta.name}
                </h3>
                <a
                  href={selectedStyleMeta.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline"
                >
                  <span>원칙 출처: {selectedStyleMeta.sourceTitle}</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
              <p className="text-sm leading-relaxed text-slate-700">
                {selectedStyleMeta.corePrinciple}
              </p>
              <p className="text-xs font-medium text-[#1D4ED8]">{portfolio.constraintNote}</p>
            </div>

            <div className="shrink-0 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 lg:w-80">
              <div className="text-xs font-semibold text-slate-700">
                기간별 적합도 (서비스 기준 판단)
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${fitBadgeClass(portfolio.horizonFitness.short)}`}>
                  단기(&lt;1년): {portfolio.horizonFitness.short}
                </span>
                <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${fitBadgeClass(portfolio.horizonFitness.mid)}`}>
                  중기(1~5년): {portfolio.horizonFitness.mid}
                </span>
                <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${fitBadgeClass(portfolio.horizonFitness.long)}`}>
                  장기(5년+): {portfolio.horizonFitness.long}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                {portfolio.horizonFitness.reason}
              </p>
            </div>
          </div>

          {/* 3. 수익·하락 요약 & 4. 가운데 빈 도넛 차트 + 원화 배분액 */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Donut Chart & Legend */}
            <div className="space-y-4 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  포트폴리오 비중 및 원화 배분
                </h4>
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setDonutMode('asset')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      donutMode === 'asset' ? 'bg-white text-[#1D4ED8] shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    자산군 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => setDonutMode('holding')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      donutMode === 'holding' ? 'bg-white text-[#1D4ED8] shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    개별 종목 보기
                  </button>
                </div>
              </div>

              {analysis.appliedInitialInvestment <= 0 ? (
                <div className="flex h-60 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    초기 투자 원금이 0원입니다.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    비상자금 확보 후 월 적립액이 쌓이면 아래 목표 비중에 따라 자동 분산 배분됩니다.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                  {/* Hollow Donut SVG */}
                  <div className="relative h-52 w-52 shrink-0">
                    <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label="포트폴리오 자산 배분 도넛 차트">
                      <circle cx="100" cy="100" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="26" />
                      {slices.map((sl, idx) => {
                        const dash = (sl.weightPct / 100) * circumference;
                        const offset = -((cumulativePct / 100) * circumference);
                        cumulativePct += sl.weightPct;
                        const isSelected = idx === selectedSliceIdx;
                        return (
                          <circle
                            key={sl.id}
                            cx="100"
                            cy="100"
                            r={radius}
                            fill="none"
                            stroke={sl.color}
                            strokeWidth={isSelected ? '30' : '26'}
                            strokeDasharray={`${dash} ${circumference}`}
                            strokeDashoffset={offset}
                            tabIndex={0}
                            role="button"
                            aria-label={`${sl.label} ${sl.weightPct}%`}
                            onClick={() => setSelectedSliceIdx(idx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedSliceIdx(idx);
                              }
                            }}
                            className="cursor-pointer transition-all focus:outline-none"
                          />
                        );
                      })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                      <span className="text-[11px] font-medium text-slate-500">
                        초기 투자금 (목표 비중)
                      </span>
                      <span className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                        {fmtKRW(analysis.appliedInitialInvestment)}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Legend */}
                  <div className="w-full space-y-2">
                    {slices.map((sl, idx) => {
                      const active = idx === selectedSliceIdx;
                      return (
                        <button
                          key={sl.id}
                          type="button"
                          onClick={() => setSelectedSliceIdx(idx)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                            active
                              ? 'border-[#1D4ED8] bg-blue-50/70'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-3 shrink-0 rounded-xs"
                              style={{ backgroundColor: sl.color }}
                            />
                            <span className="truncate font-semibold text-slate-800">{sl.label}</span>
                          </div>
                          <div className="shrink-0 text-right font-mono tabular-nums">
                            <span className="font-bold text-slate-900">{sl.weightPct.toFixed(1)}%</span>
                            <span className="ml-2 text-slate-500">{fmtKRW(sl.amountKRW)}</span>
                          </div>
                        </button>
                      );
                    })}
                    <div className="text-right font-mono text-[11px] text-slate-500 tabular-nums">
                      전체 비중 합계: {slices.reduce((s, x) => s + x.weightPct, 0).toFixed(1)}% (목표 비중 기준)
                    </div>
                  </div>
                </div>
              )}

              {activeSlice && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">
                    선택 항목 상세: {activeSlice.label} ({activeSlice.weightPct.toFixed(1)}%)
                  </div>
                  <p className="mt-1 leading-relaxed">{activeSlice.riskSummary}</p>
                  <p className="mt-1 text-[11px] text-slate-500">기준: {activeSlice.asOfDate}</p>
                </div>
              )}
            </div>

            {/* Right: Return / Downside Summary + Weight Sliders + Action Buttons */}
            <div className="space-y-4 lg:col-span-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  <span className="block text-xs font-medium text-slate-500">
                    모형 예상 연환산 수익률 (중앙값 / 평균)
                  </span>
                  <div className="mt-1 font-mono text-base font-bold text-[#1D4ED8] tabular-nums">
                    {fmtPct(endStats.twrAnnualizedMedian, 2, true)}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums">
                    총수익(입출금 보정) 중앙 {fmtPct(endStats.twrTotalReturnMedian, 1, true)} · 평균{' '}
                    {fmtPct(endStats.twrTotalReturnMean, 1, true)}
                  </div>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3.5">
                  <span className="block text-xs font-medium text-rose-700">
                    하락 시나리오 · 하위 5% (보장 상한 아님)
                  </span>
                  <div className="mt-1 font-mono text-base font-bold text-rose-700 tabular-nums">
                    {fmtPct(oneYearStats.twrTotalReturnP5, 1, true)} (1년 기준)
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-rose-700 tabular-nums">
                    1년 원금 미만 확률 {fmtPct(oneYearStats.lossVsNetPrincipalProb, 1)} · {horizonYears}년{' '}
                    {fmtPct(endStats.lossVsNetPrincipalProb, 1)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1.5">
                <div className="font-semibold text-slate-900">구현된 규칙 및 미재현 한계</div>
                {selectedStyleMeta.implementedRules.map((r, i) => (
                  <p key={i} className="text-slate-600">✓ {r}</p>
                ))}
                {selectedStyleMeta.unreplicatedParts.map((u, i) => (
                  <p key={i} className="text-amber-800">! {u}</p>
                ))}
              </div>

              {portfolio.overlapWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
                  <strong>중복 노출 및 환위험 안내:</strong> {portfolio.overlapWarnings.join(' ')}
                </div>
              )}

              {/* 5. 비중 수정 & 시뮬레이션 실행 버튼 */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingWeights((v) => !v)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{editingWeights ? '비중 수정 닫기' : '비중 직접 수정'}</span>
                </button>
                {customWeights && (
                  <button
                    type="button"
                    onClick={() => onChangeCustomWeights(null)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>스타일 기본 비중 복원</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoSimulation}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                >
                  <span>4. 10,000회 시간 여행 실행하기</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {editingWeights && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-800">
                    자산군 비중 직접 조절 (합계 100% 자동 유지)
                  </div>
                  {ASSET_CLASS_ORDER.map((aId) => {
                    const pct = Math.round(portfolio.assetWeights[aId] * 100);
                    return (
                      <div key={aId}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{assetSpecs[aId].label}</span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">{pct}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={pct}
                          onChange={(e) => handleSliderWeight(aId, Number(e.target.value))}
                          className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Same-Seed Style Comparison Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900">
          동일 조건 · 동일 시장 경로(Seed #{seed}) 4가지 스타일 비교
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          같은 초기금({fmtKRW(analysis.appliedInitialInvestment)}), 같은 월 적립({fmtKRW(analysis.appliedMonthlyInvestment)}), 같은 성향 한도({profileLabel(riskEval.appliedProfile)})에서 스타일 규칙에 따른 차이를 확인합니다.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">투자자 스타일</th>
                <th className="py-2 px-3 font-medium">주식/개별주 합계</th>
                <th className="py-2 px-3 font-medium">리밸런싱</th>
                <th className="py-2 px-3 text-right font-medium">연간 보수</th>
                <th className="py-2 px-3 text-right font-medium">{horizonYears}년 중앙 평가액</th>
                <th className="py-2 pl-3 text-right font-medium">1년 하위 5%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {styleComparisons.map(({ styleId: sId, rec, sim }) => {
                const eqPct = (rec.assetWeights.equity_index + rec.assetWeights.quality_stock) * 100;
                const endM = sim.milestones.horizonEnd;
                const y1 = sim.milestones.oneYear ?? endM;
                const isActive = sId === styleId;
                return (
                  <tr
                    key={sId}
                    className={isActive ? 'bg-blue-50/50 font-semibold' : 'hover:bg-slate-50'}
                  >
                    <td className="py-2.5 pr-3 text-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeCustomWeights(null);
                          onSelectStyle(sId);
                        }}
                        className="text-left hover:text-[#1D4ED8] hover:underline"
                      >
                        {INVESTOR_STYLES[sId].name}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      {eqPct.toFixed(1)}% (개별주 {(rec.assetWeights.quality_stock * 100).toFixed(1)}%)
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{INVESTOR_STYLES[sId].rebalanceLabel}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {(rec.weightedAnnualFee * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#1D4ED8] tabular-nums">
                      {fmtKRW(endM.nominalMedian)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono text-rose-700 tabular-nums">
                      {fmtPct(y1.twrTotalReturnP5, 1, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Candidate Instruments & Quality Stock Criteria */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            비교 가능한 투자 후보 상품·종목 참고 카드
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            실시간 시세를 조회하지 않았으며, 공식 운용사·거래소 문서를 근거로 역할을 설명하는 참고 정보입니다. 시뮬레이션 계산용 가상 자산과 실제 상품 공시를 구분합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {INSTRUMENT_CANDIDATES.map((cand) => (
            <article
              key={cand.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-[#1D4ED8]">
                    {assetSpecs[cand.assetClass].label} · {cand.isVirtualModelAsset ? '시뮬레이션 가상 바스켓' : '실제 공시 참고'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">{cand.currency}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{cand.name}</h3>
                <div className="font-mono text-[11px] text-slate-500">
                  티커: {cand.ticker} · 환헤지:{' '}
                  {cand.fxHedged === null ? '해당없음(원화)' : cand.fxHedged ? '헤지형' : '환노출형'}
                </div>
                <p className="text-xs leading-relaxed text-slate-700">
                  <strong>역할:</strong> {cand.role}
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                  <strong>선택 근거:</strong> {cand.selectionReason}
                </p>
                <div className="text-xs text-slate-600">
                  <strong>주요 위험:</strong> {cand.keyRisks.join(' / ')}
                </div>
                {cand.overlapNote && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                    중복 주의: {cand.overlapNote}
                  </p>
                )}
              </div>

              <div className="mt-3 border-t border-slate-200 pt-2.5 text-[11px] text-slate-500 space-y-1">
                <div>비용(보수): {cand.expenseRatioLabel}</div>
                <div>기준일: {cand.asOfDate}</div>
                <a
                  href={cand.officialSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[#1D4ED8] hover:underline"
                >
                  <span>출처: {cand.officialSourceName}</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
            <span>‘우량주 후보’ 선정 기준 (특정 종목 매수 추천 아님)</span>
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
            {QUALITY_STOCK_CRITERIA.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
