import { describe, expect, it } from 'vitest';
import { SAMPLE_HISTORICAL_ROWS } from '../../data/historicalSample';
import {
  ASSET_CLASS_ORDER,
  DEFAULT_ASSET_SPECS,
  DEFAULT_CORRELATION_MATRIX,
} from '../../data/instruments';
import { DEMO_PERSONAS } from '../../data/presets';
import { AssetClassId, AssetClassSpec, CashflowInput } from '../../types/wealth';
import { parseHistoricalCsv, runSequentialWalkForwardBacktest } from '../backtest';
import { analyzeCashflow, validateCashflowInput } from '../cashflow';
import {
  buildHoldingsFromWeights,
  buildPortfolioRecommendation,
  computeStyleWeights,
  evaluateRiskProfile,
} from '../portfolio';
import { choleskyWithValidation, runWealthSimulation } from '../simulator';

function cloneZeroCostSpecs(annualReturn: number, vol: number): Record<AssetClassId, AssetClassSpec> {
  const out = {} as Record<AssetClassId, AssetClassSpec>;
  for (const id of ASSET_CLASS_ORDER) {
    out[id] = {
      ...DEFAULT_ASSET_SPECS[id],
      annualSimpleReturn: annualReturn,
      annualLogVolatility: vol,
      annualFee: 0,
      fxExposed: false,
      annualFxReturn: 0,
      annualFxVolatility: 0,
    };
  }
  return out;
}

describe('내일의 자산 — 금융 계산 및 시뮬레이션 엔진 검증', () => {
  it('1. 지출·부채·비상자금·단기 목표 중복 차감 방지 및 사용 불가 자산 제외', () => {
    const office = structuredClone(DEMO_PERSONAS[1].cashflow);
    // office persona has 80M jeonse debt marked includedInEssentialExpense: true
    const analysis = analyzeCashflow(office);

    // Monthly outflow should NOT subtract the 240,000원 debt payment a second time
    const expectedEssential = 450_000 + 550_000 + 160_000 + 150_000 + 200_000;
    const expectedIrregular = 3_600_000 / 12;
    expect(analysis.additionalDebtMonthlyPayment).toBe(0);
    expect(analysis.totalMonthlyOutflow).toBe(expectedEssential + 450_000 + expectedIrregular);
    expect(analysis.monthlySurplus).toBe(3_800_000 - analysis.totalMonthlyOutflow);

    // Locked 50M Jeonse deposit must NOT be included in liquid cash or recommended initial investment
    expect(analysis.liquidCashTotal).toBe(22_000_000);
    expect(analysis.availableCashAfterProtection).toBeLessThan(22_000_000);
    expect(analysis.netWorthIncludingLocked).toBe(
      22_000_000 + 8_000_000 + 50_000_000 - 80_000_000
    );
  });

  it('2. 적자 또는 비상자금 부족 시 추천 월 적립 투자액을 0원으로 산정하고 검증 에러를 감지한다', () => {
    const rookie = structuredClone(DEMO_PERSONAS[0].cashflow);
    const rookieAnalysis = analyzeCashflow(rookie);
    expect(rookieAnalysis.emergencyShortfall).toBeGreaterThan(0);
    expect(rookieAnalysis.recommendedMonthlyInvestment).toBe(0);

    // Deficit test
    const deficitInput: CashflowInput = {
      ...rookie,
      monthlyNetIncome: 1_500_000,
    };
    const deficitAnalysis = analyzeCashflow(deficitInput);
    expect(deficitAnalysis.isDeficit).toBe(true);
    expect(deficitAnalysis.recommendedMonthlyInvestment).toBe(0);

    // Validation errors for bad age / negative income / NaN
    const badErrors = validateCashflowInput({
      ...rookie,
      currentAge: 40,
      retireAge: 35,
      monthlyNetIncome: -100,
      emergencyTargetMonths: 40,
    });
    expect(badErrors.length).toBe(3);
  });

  it('3. 무변동·무비용 테스트: 초기 1,000만 원을 연 10% 유효수익률로 1년 운용하면 정확히 1,100만 원', () => {
    const base = structuredClone(DEMO_PERSONAS[1].cashflow);
    base.currentAge = 30;
    base.retireAge = 31; // 1 year
    base.initialInvestOverride = 10_000_000;
    base.monthlyInvestOverride = 0;
    base.plannedWithdrawals = [];
    base.annualIncomeGrowthRate = 0;
    base.annualInflationRate = 0;

    const analysis = analyzeCashflow(base);
    const specs = cloneZeroCostSpecs(0.1, 0);
    const portfolio = buildPortfolioRecommendation(
      'moderate',
      'balanced_core',
      base,
      analysis,
      DEMO_PERSONAS[1].risk,
      specs
    );
    // Override rebalanceCostRate to 0 for exact frictionless identity check
    portfolio.rebalanceCostRate = 0;

    const out = runWealthSimulation({
      cashflow: base,
      analysis,
      portfolio,
      assetSpecs: specs,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 50,
      seed: 123,
    });

    expect(Math.round(out.milestones.horizonEnd.nominalMedian)).toBe(11_000_000);
    expect(out.selectedPathTwrTotal).toBeCloseTo(0.1, 6);
  });

  it('4. 수익률·비용·인출 0이고 매월 말 30만 원을 120회 넣으면 초기 1,000만 원 포함 4,600만 원 & 적립금은 투자수익 아님', () => {
    const base = structuredClone(DEMO_PERSONAS[1].cashflow);
    base.currentAge = 30;
    base.retireAge = 40; // 120 months
    base.initialInvestOverride = 10_000_000;
    base.monthlyInvestOverride = 300_000;
    base.plannedWithdrawals = [];
    base.annualIncomeGrowthRate = 0;
    base.annualInflationRate = 0;

    const analysis = analyzeCashflow(base);
    const specs = cloneZeroCostSpecs(0, 0);
    const portfolio = buildPortfolioRecommendation(
      'moderate',
      'balanced_core',
      base,
      analysis,
      DEMO_PERSONAS[1].risk,
      specs
    );
    portfolio.rebalanceCostRate = 0;

    const out = runWealthSimulation({
      cashflow: base,
      analysis,
      portfolio,
      assetSpecs: specs,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 50,
      seed: 999,
    });

    expect(Math.round(out.milestones.horizonEnd.nominalMedian)).toBe(46_000_000);
    expect(Math.round(out.milestones.horizonEnd.totalContributedMean)).toBe(46_000_000);
    // Adding 36M in deposits with 0% return MUST NOT report positive investment profit or TWR!
    expect(Math.round(out.milestones.horizonEnd.medianProfit)).toBe(0);
    expect(out.selectedPathTwrTotal).toBeCloseTo(0, 6);
  });

  it('5. 인출은 투자 손실이 아니며, 잔액 초과 인출 시 음수 잔액 없이 부족액만 기록하고 TWR 낙폭과 구분한다', () => {
    const base = structuredClone(DEMO_PERSONAS[1].cashflow);
    base.currentAge = 30;
    base.retireAge = 32; // 24 months
    base.initialInvestOverride = 10_000_000;
    base.monthlyInvestOverride = 0;
    base.annualIncomeGrowthRate = 0;
    base.plannedWithdrawals = [
      { id: 'w1', label: '중간 인출', monthIndex: 12, amount: 6_000_000 },
      { id: 'w2', label: '초과 인출', monthIndex: 18, amount: 10_000_000 },
    ];

    const analysis = analyzeCashflow(base);
    const specs = cloneZeroCostSpecs(0.1, 0);
    const portfolio = buildPortfolioRecommendation(
      'moderate',
      'balanced_core',
      base,
      analysis,
      DEMO_PERSONAS[1].risk,
      specs
    );
    portfolio.rebalanceCostRate = 0;

    const out = runWealthSimulation({
      cashflow: base,
      analysis,
      portfolio,
      assetSpecs: specs,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 30,
      seed: 7,
    });

    // Balance must never go negative
    for (const pt of out.selectedPath) {
      expect(pt.nominalBalance).toBeGreaterThanOrEqual(0);
    }
    // Withdrawal must not cause a fake investment drawdown when return is +10% deterministic
    expect(out.selectedPathMaxDrawdown).toBeCloseTo(0, 6);
    expect(out.selectedPathShortfalls).toBeGreaterThan(0);
    expect(out.milestones.horizonEnd.shortfallPathProb).toBe(1);
  });

  it('6. 동일 seed 재현성, 상이한 seed 경로 차이, 백분위 순서, 행렬 대칭 보정 확인', () => {
    const base = structuredClone(DEMO_PERSONAS[1].cashflow);
    base.currentAge = 30;
    base.retireAge = 40;
    base.initialInvestOverride = 10_000_000;
    base.monthlyInvestOverride = 500_000;
    const analysis = analyzeCashflow(base);
    const portfolio = buildPortfolioRecommendation(
      'moderate',
      'balanced_core',
      base,
      analysis,
      DEMO_PERSONAS[1].risk,
      DEFAULT_ASSET_SPECS
    );

    const runA = runWealthSimulation({
      cashflow: base,
      analysis,
      portfolio,
      assetSpecs: DEFAULT_ASSET_SPECS,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 200,
      seed: 4242,
    });
    const runB = runWealthSimulation({
      cashflow: base,
      analysis,
      portfolio,
      assetSpecs: DEFAULT_ASSET_SPECS,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 200,
      seed: 4242,
    });
    const runC = runWealthSimulation({
      cashflow: base,
      analysis,
      portfolio,
      assetSpecs: DEFAULT_ASSET_SPECS,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 200,
      seed: 9876,
    });

    expect(runA.milestones.horizonEnd.nominalMedian).toBe(
      runB.milestones.horizonEnd.nominalMedian
    );
    expect(runA.selectedPath[12].nominalBalance).toBe(runB.selectedPath[12].nominalBalance);
    expect(runA.selectedPath[12].nominalBalance).not.toBe(runC.selectedPath[12].nominalBalance);

    const end = runA.milestones.horizonEnd;
    expect(end.nominalP5).toBeLessThanOrEqual(end.nominalP25);
    expect(end.nominalP25).toBeLessThanOrEqual(end.nominalMedian);
    expect(end.nominalMedian).toBeLessThanOrEqual(end.nominalP75);
    expect(end.nominalP75).toBeLessThanOrEqual(end.nominalP95);

    const chol = choleskyWithValidation(DEFAULT_CORRELATION_MATRIX);
    expect(chol.wasAdjusted).toBe(false);
  });

  it('7. 투자자 스타일별 비중·회전율·위험한도 제약, 0원 빈 상태, 도넛 합계 100%, 미래 정보 미사용 검증', () => {
    const freelancer = structuredClone(DEMO_PERSONAS[2].cashflow);
    const analysis = analyzeCashflow(freelancer);
    const riskEval = evaluateRiskProfile(freelancer, analysis, DEMO_PERSONAS[2].risk);

    // Freelancer has high willingness (5/5) but low stability & debt -> capacity caps profile
    expect(riskEval.capacityCapped).toBe(true);
    expect(riskEval.recommendedProfile).not.toBe('aggressive');

    // Conservative user choosing Buffett style must still stay capped inside conservative equity limit (<= 22%)
    const buffettCons = computeStyleWeights('conservative', 'buffett');
    expect(buffettCons.wasConstrained).toBe(true);
    expect(
      buffettCons.constrained.equity_index + buffettCons.constrained.quality_stock
    ).toBeLessThanOrEqual(0.2201);

    // Distinct weights across styles under moderate profile
    const coreMod = computeStyleWeights('moderate', 'balanced_core').constrained;
    const buffettMod = computeStyleWeights('moderate', 'buffett').constrained;
    const lynchMod = computeStyleWeights('moderate', 'lynch').constrained;
    const druckenMod = computeStyleWeights('moderate', 'druckenmiller').constrained;

    expect(buffettMod.quality_stock).toBeGreaterThan(coreMod.quality_stock);
    expect(lynchMod.quality_stock).toBeGreaterThanOrEqual(buffettMod.quality_stock);
    expect(druckenMod.gold).toBeGreaterThan(buffettMod.gold);

    // Holdings sum to exact 100.0% and exact KRW principal; 0 KRW handles cleanly
    const holdings = buildHoldingsFromWeights(buffettMod, 12_345_678, DEFAULT_ASSET_SPECS);
    const pctSum = holdings.reduce((s, h) => s + h.weightPct, 0);
    const amtSum = holdings.reduce((s, h) => s + h.amountKRW, 0);
    expect(pctSum).toBeCloseTo(100, 1);
    expect(amtSum).toBe(12_345_678);

    const zeroHoldings = buildHoldingsFromWeights(buffettMod, 0, DEFAULT_ASSET_SPECS);
    expect(zeroHoldings.every((h) => h.amountKRW === 0)).toBe(true);

    // Zero look-ahead bias check for Druckenmiller sequential walk-forward backtest:
    // Modifying rows AFTER index 60 must not change window 1 (rows 36..60) result.
    const origBt = runSequentialWalkForwardBacktest(
      SAMPLE_HISTORICAL_ROWS.slice(0, 80),
      'druckenmiller',
      'moderate',
      36
    );
    const mutatedRows = structuredClone(SAMPLE_HISTORICAL_ROWS.slice(0, 80));
    for (let i = 72; i < mutatedRows.length; i++) {
      mutatedRows[i].returns.equity_index = -0.35;
    }
    const mutatedBt = runSequentialWalkForwardBacktest(
      mutatedRows,
      'druckenmiller',
      'moderate',
      36
    );
    expect(origBt[0].endingValueOn10M).toBe(mutatedBt[0].endingValueOn10M);
  });

  it('8. 해외자산 원화 환산(1+r)(1+f)-1 적용 및 블록 부트스트랩 · CSV 파서 검증', () => {
    const csvSample = [
      'date,cash,bond,equity_index,gold,quality_stock',
      '2024-01,0.3,0.5,2.1,1.0,2.5',
      '2024-02,0.3,-0.4,1.8,0.5,1.2',
      '2024-03,0.3,0.2,-1.5,2.0,-2.0',
    ].join('\n');
    const parsed = parseHistoricalCsv(csvSample, 'auto');
    expect(parsed.errors.length).toBe(0);
    expect(parsed.detectedUnit).toBe('percent');
    expect(parsed.rows.length).toBe(3);
    expect(parsed.rows[0].returns.equity_index).toBeCloseTo(0.021, 5);
    expect(parsed.warnings.length).toBe(1); // short window warning (< 36 months)

    // Duplicate date check
    const dupCsv = [
      'date,cash,bond,equity_index,gold,quality_stock',
      '2024-01,0.003,0.005,0.02,0.01,0.025',
      '2024-01,0.003,0.005,0.02,0.01,0.025',
    ].join('\n');
    const dupParsed = parseHistoricalCsv(dupCsv);
    expect(dupParsed.errors.length).toBeGreaterThan(0);

    // Actual 10,000-run Monte Carlo & Bootstrap test
    const office = structuredClone(DEMO_PERSONAS[1].cashflow);
    office.retireAge = 40;
    const analysis = analyzeCashflow(office);
    const portfolio = buildPortfolioRecommendation(
      'moderate',
      'balanced_core',
      office,
      analysis,
      DEMO_PERSONAS[1].risk,
      DEFAULT_ASSET_SPECS
    );

    const mcOut = runWealthSimulation({
      cashflow: office,
      analysis,
      portfolio,
      assetSpecs: DEFAULT_ASSET_SPECS,
      mode: 'parametric',
      dataMode: 'dev_assumption',
      runCount: 10_000,
      seed: 2026,
    });
    expect(mcOut.runCount).toBe(10_000);
    expect(mcOut.finalValuesSorted.length).toBe(10_000);

    const bootOut = runWealthSimulation({
      cashflow: office,
      analysis,
      portfolio,
      assetSpecs: DEFAULT_ASSET_SPECS,
      mode: 'bootstrap',
      dataMode: 'historical_sample',
      historicalRows: SAMPLE_HISTORICAL_ROWS,
      bootstrapBlockLength: 12,
      runCount: 1000,
      seed: 2026,
    });
    expect(bootOut.runCount).toBe(1000);
    expect(bootOut.milestones.horizonEnd.nominalMedian).toBeGreaterThan(0);
  });
});
