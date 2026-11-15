import {
  ASSET_CLASS_ORDER,
  BASE_PROFILE_WEIGHTS,
  INVESTOR_STYLES,
} from '../data/instruments';
import {
  AssetClassId,
  AssetClassSpec,
  CashflowAnalysis,
  CashflowInput,
  FitGrade,
  HoldingAllocation,
  InvestorStyleId,
  PortfolioRecommendation,
  RiskAssessmentInput,
  RiskEvaluationResult,
  RiskProfileId,
} from '../types/wealth';

export function evaluateRiskProfile(
  cashflow: CashflowInput,
  analysis: CashflowAnalysis,
  riskInput: RiskAssessmentInput
): RiskEvaluationResult {
  // 1. Willingness score (0..100)
  const reactionNorm = ((Math.min(5, Math.max(1, riskInput.lossReactionScore)) - 1) / 4) * 100;
  const volNorm = ((Math.min(5, Math.max(1, riskInput.volatilityPreferenceScore)) - 1) / 4) * 100;
  const expScore =
    riskInput.experience === 'experienced' ? 85 : riskInput.experience === 'basic' ? 55 : 25;
  const willingnessScore = Math.round(reactionNorm * 0.45 + volNorm * 0.35 + expScore * 0.2);

  // 2. Objective capacity score (0..100)
  const horizonYears = Math.max(1, cashflow.retireAge - cashflow.currentAge);
  let capacityScore = 50;
  const reasons: string[] = [];

  if (horizonYears >= 15) {
    capacityScore += 20;
    reasons.push(`투자 가능 기간이 ${horizonYears}년으로 길어 단기 변동성을 회복할 시간 여유가 있습니다.`);
  } else if (horizonYears >= 7) {
    capacityScore += 10;
    reasons.push(`투자 가능 기간이 ${horizonYears}년으로 중장기 분산 운용이 가능합니다.`);
  } else {
    capacityScore -= 15;
    reasons.push(`투자 가능 기간(${horizonYears}년)이 짧아 원금 방어 비중을 높일 필요가 있습니다.`);
  }

  if (cashflow.incomeStability === 'high') {
    capacityScore += 15;
    reasons.push('소득 안정성이 높아 정기 적립 유지력이 양호합니다.');
  } else if (cashflow.incomeStability === 'low') {
    capacityScore -= 20;
    reasons.push('소득 변동성이 크므로 비상자금과 안전자산 완충 비중을 높여야 합니다.');
  }

  if (analysis.emergencyShortfall > 0) {
    capacityScore -= 20;
    reasons.push(
      `비상자금이 목표 대비 ${Math.round(analysis.emergencyShortfall).toLocaleString('ko-KR')}원 부족해 실제 손실 감당 여력이 제한됩니다.`
    );
  } else {
    capacityScore += 10;
  }

  if (analysis.monthlyDebtServiceRatio >= 0.3) {
    capacityScore -= 15;
    reasons.push('소득 대비 월 부채 상환 부담(30% 이상)이 높아 공격적 위험 노출을 제한합니다.');
  }

  if (analysis.isDeficit) {
    capacityScore -= 25;
    reasons.push('현재 월 현금흐름이 적자 상태이므로 위험자산 투자 확대가 부적절합니다.');
  }

  capacityScore = Math.max(0, Math.min(100, Math.round(capacityScore)));

  const scoreToProfile = (score: number): RiskProfileId => {
    if (score < 42) return 'conservative';
    if (score < 70) return 'moderate';
    return 'aggressive';
  };

  const willingnessProfile = scoreToProfile(willingnessScore);
  const capacityProfile = scoreToProfile(capacityScore);

  // Capacity constrains excessive willingness
  const profileRank: Record<RiskProfileId, number> = {
    conservative: 0,
    moderate: 1,
    aggressive: 2,
  };
  const rankToProfile: RiskProfileId[] = ['conservative', 'moderate', 'aggressive'];

  const effectiveRank = Math.min(profileRank[willingnessProfile], profileRank[capacityProfile]);
  const recommendedProfile = rankToProfile[effectiveRank];
  const capacityCapped = profileRank[willingnessProfile] > profileRank[capacityProfile];

  if (capacityCapped) {
    reasons.unshift(
      '위험 선호 의사(성향)는 높으나 실제 현금흐름·비상자금·소득 안정성 여건을 반영해 한 단계 낮춘 성향을 권장합니다.'
    );
  }

  const combinedScore = Math.round(willingnessScore * 0.4 + capacityScore * 0.6);
  const appliedProfile = riskInput.userProfileOverride ?? recommendedProfile;

  return {
    willingnessScore,
    capacityScore,
    combinedScore,
    willingnessProfile,
    capacityProfile,
    recommendedProfile,
    appliedProfile,
    reasons,
    capacityCapped,
  };
}

export function normalizeWeights(raw: Record<AssetClassId, number>): Record<AssetClassId, number> {
  const clean: Record<AssetClassId, number> = {
    cash: Math.max(0, Number.isFinite(raw.cash) ? raw.cash : 0),
    bond: Math.max(0, Number.isFinite(raw.bond) ? raw.bond : 0),
    equity_index: Math.max(0, Number.isFinite(raw.equity_index) ? raw.equity_index : 0),
    gold: Math.max(0, Number.isFinite(raw.gold) ? raw.gold : 0),
    quality_stock: Math.max(0, Number.isFinite(raw.quality_stock) ? raw.quality_stock : 0),
  };

  const sum = ASSET_CLASS_ORDER.reduce((acc, k) => acc + clean[k], 0);
  if (sum <= 0) {
    return { cash: 1, bond: 0, equity_index: 0, gold: 0, quality_stock: 0 };
  }

  const out = { ...clean };
  for (const k of ASSET_CLASS_ORDER) {
    out[k] = clean[k] / sum;
  }
  return out;
}

/**
 * Computes unconstrained style target weights and then caps risky equity/concentration
 * strictly within the user's RiskProfileId & cashflow constraints.
 */
export function computeStyleWeights(
  profileId: RiskProfileId,
  styleId: InvestorStyleId
): {
  unconstrained: Record<AssetClassId, number>;
  constrained: Record<AssetClassId, number>;
  wasConstrained: boolean;
  constraintNote: string;
} {
  // Unconstrained style blueprint
  let unconstrained: Record<AssetClassId, number>;
  if (styleId === 'balanced_core') {
    unconstrained = { ...BASE_PROFILE_WEIGHTS[profileId] };
  } else if (styleId === 'buffett') {
    unconstrained = {
      cash: 0.15,
      bond: 0.12,
      equity_index: 0.48,
      gold: 0.03,
      quality_stock: 0.22,
    };
  } else if (styleId === 'lynch') {
    unconstrained = {
      cash: 0.06,
      bond: 0.10,
      equity_index: 0.46,
      gold: 0.05,
      quality_stock: 0.33,
    };
  } else {
    // druckenmiller: flexible macro allocation (initial baseline)
    unconstrained = {
      cash: 0.10,
      bond: 0.25,
      equity_index: 0.40,
      gold: 0.15,
      quality_stock: 0.10,
    };
  }

  unconstrained = normalizeWeights(unconstrained);

  // User risk limits (equity max + single/quality stock max + minimum cash/bond floor)
  const limits: Record<
    RiskProfileId,
    { maxTotalEquity: number; maxQualityStock: number; minDefensive: number }
  > = {
    conservative: { maxTotalEquity: 0.22, maxQualityStock: 0.05, minDefensive: 0.68 },
    moderate: { maxTotalEquity: 0.55, maxQualityStock: 0.15, minDefensive: 0.35 },
    aggressive: { maxTotalEquity: 0.80, maxQualityStock: 0.25, minDefensive: 0.15 },
  };

  const limit = limits[profileId];
  const constrained = { ...unconstrained };
  let wasConstrained = false;

  // 1. Enforce total equity cap first
  const totalEq = constrained.equity_index + constrained.quality_stock;
  if (totalEq > limit.maxTotalEquity) {
    const scale = limit.maxTotalEquity / totalEq;
    const removed = totalEq - limit.maxTotalEquity;
    constrained.equity_index *= scale;
    constrained.quality_stock *= scale;
    constrained.cash += removed * 0.4;
    constrained.bond += removed * 0.6;
    wasConstrained = true;
  }

  // 2. Enforce quality stock concentration cap (moving excess into diversified equity index)
  if (constrained.quality_stock > limit.maxQualityStock) {
    const excess = constrained.quality_stock - limit.maxQualityStock;
    constrained.quality_stock = limit.maxQualityStock;
    constrained.equity_index += excess;
    wasConstrained = true;
  }

  // Enforce defensive (cash + bond) minimum floor
  const defensive = constrained.cash + constrained.bond;
  if (defensive < limit.minDefensive) {
    const shortfall = limit.minDefensive - defensive;
    constrained.cash += shortfall * 0.4;
    constrained.bond += shortfall * 0.6;
    const risky = constrained.equity_index + constrained.quality_stock + constrained.gold;
    if (risky > 0) {
      const rScale = Math.max(0, (risky - shortfall) / risky);
      constrained.equity_index *= rScale;
      constrained.quality_stock *= rScale;
      constrained.gold *= rScale;
    }
    wasConstrained = true;
  }

  const finalConstrained = normalizeWeights(constrained);
  const constraintNote = wasConstrained
    ? `${INVESTOR_STYLES[styleId].name}의 원래 주식·집중 비중을 현재 성향(${
        profileId === 'conservative' ? '보수형' : profileId === 'moderate' ? '중립형' : '위험감수형'
      }) 위험 한도에 맞춰 자동 조정했습니다.`
    : '현재 성향의 위험 한도 내에서 스타일 배분이 그대로 적용되었습니다.';

  return {
    unconstrained,
    constrained: finalConstrained,
    wasConstrained,
    constraintNote,
  };
}

export function buildHoldingsFromWeights(
  weights: Record<AssetClassId, number>,
  totalInvestAmount: number,
  assetSpecs: Record<AssetClassId, AssetClassSpec>
): HoldingAllocation[] {
  const normalized = normalizeWeights(weights);
  const activeClasses = ASSET_CLASS_ORDER.filter((k) => normalized[k] > 0.0001);

  // Convert weights to 0.1%-precision percentages whose sum is guaranteed 100.0%
  const rawPctTenths = activeClasses.map((k) => Math.round(normalized[k] * 1000));
  const sumTenths = rawPctTenths.reduce((a, b) => a + b, 0);
  if (rawPctTenths.length > 0 && sumTenths !== 1000) {
    let maxIdx = 0;
    for (let i = 1; i < rawPctTenths.length; i++) {
      if (rawPctTenths[i] > rawPctTenths[maxIdx]) maxIdx = i;
    }
    rawPctTenths[maxIdx] += 1000 - sumTenths;
  }

  const tickerLabels: Record<AssetClassId, { id: string; ticker: string; name: string }> = {
    cash: {
      id: 'krx_cd_mmf',
      ticker: '459580.KS / CMA',
      name: '현금성 자산 (CMA·단기금리 ETF)',
    },
    bond: {
      id: 'krx_bond_10y',
      ticker: '365780.KS / 국채',
      name: '채권 (국내 국고채·우량채)',
    },
    equity_index: {
      id: 'us_sp500_etf',
      ticker: '360750.KS / 069500.KS',
      name: '국내외 분산 주가지수 ETF',
    },
    gold: {
      id: 'krx_gold_spot',
      ticker: '411060.KS / GLDM',
      name: '금 현물형 자산',
    },
    quality_stock: {
      id: 'quality_basket_kr_us',
      ticker: '우량주 선별 바스켓(모형)',
      name: '개별 우량주 후보군',
    },
  };

  let allocatedSum = 0;
  const holdings: HoldingAllocation[] = activeClasses.map((assetClass, idx) => {
    const pct = rawPctTenths[idx] / 10;
    let amount = 0;
    if (totalInvestAmount > 0) {
      if (idx === activeClasses.length - 1) {
        amount = Math.max(0, Math.round(totalInvestAmount) - allocatedSum);
      } else {
        amount = Math.round((totalInvestAmount * pct) / 100);
        allocatedSum += amount;
      }
    }
    const spec = assetSpecs[assetClass];
    const meta = tickerLabels[assetClass];
    return {
      instrumentId: meta.id,
      name: meta.name,
      ticker: meta.ticker,
      assetClass,
      weightPct: pct,
      amountKRW: amount,
      color: spec.color,
    };
  });

  return holdings;
}

export function evaluateHorizonFitness(
  styleId: InvestorStyleId,
  profileId: RiskProfileId,
  horizonYears: number,
  analysis: CashflowAnalysis
): { short: FitGrade; mid: FitGrade; long: FitGrade; reason: string } {
  const liquidityPenalty = analysis.emergencyShortfall > 0 || analysis.isDeficit;

  if (styleId === 'buffett') {
    return {
      short: '주의',
      mid: profileId === 'conservative' ? '적합' : '보통',
      long: liquidityPenalty ? '보통' : '적합',
      reason:
        '사업의 질과 장기 보유 원칙은 5년 이상 장기 구간에서 복리·저회전 효과가 두드러지며, 1년 미만 단기에는 주가 변동 폭이 부담될 수 있습니다.',
    };
  }
  if (styleId === 'lynch') {
    return {
      short: '주의',
      mid: profileId === 'aggressive' ? '보통' : '보통',
      long: liquidityPenalty ? '보통' : '적합',
      reason:
        '성장성과 가격 균형을 추구하는 모형은 기업 실적 확인과 성장 실현까지 시간이 필요하므로 5년 이상 중장기 시계에 적합합니다.',
    };
  }
  if (styleId === 'druckenmiller') {
    return {
      short: profileId === 'conservative' ? '보통' : '보통',
      mid: liquidityPenalty ? '보통' : '적합',
      long: '보통',
      reason:
        '시장 신호에 따라 현금·채권·주식을 유연하게 조절하는 단순화 모형으로 중기(1~5년) 국면 대응에 강점이 있으나, 신호 오판 시 회전 비용이 발생합니다.',
    };
  }
  // balanced_core
  return {
    short: profileId === 'conservative' ? '적합' : '주의',
    mid: liquidityPenalty ? '보통' : '적합',
    long: horizonYears >= 5 ? '적합' : '보통',
    reason:
      '자산군 분산과 정기 리밸런싱은 특정 시기에 의존하지 않아 중·장기 적립에 무난하며, 보수형은 단기 방어력도 상대적으로 양호합니다.',
  };
}

export function buildPortfolioRecommendation(
  profileId: RiskProfileId,
  styleId: InvestorStyleId,
  cashflow: CashflowInput,
  analysis: CashflowAnalysis,
  riskInput: RiskAssessmentInput,
  assetSpecs: Record<AssetClassId, AssetClassSpec>,
  customWeights?: Record<AssetClassId, number> | null
): PortfolioRecommendation {
  const styleCompute = computeStyleWeights(profileId, styleId);
  const finalWeights = customWeights ? normalizeWeights(customWeights) : styleCompute.constrained;
  const holdings = buildHoldingsFromWeights(
    finalWeights,
    analysis.appliedInitialInvestment,
    assetSpecs
  );

  const horizonYears = Math.max(1, cashflow.retireAge - cashflow.currentAge);
  const horizonFitness = evaluateHorizonFitness(styleId, profileId, horizonYears, analysis);

  const rebalanceConfig: Record<
    InvestorStyleId,
    { mode: PortfolioRecommendation['rebalanceMode']; cost: number; turnover: number }
  > = {
    balanced_core: { mode: 'quarterly', cost: 0.0005, turnover: 0.12 },
    buffett: { mode: 'annual', cost: 0.0005, turnover: 0.05 },
    lynch: { mode: 'semiannual', cost: 0.0006, turnover: 0.18 },
    druckenmiller: { mode: 'signal_tactical', cost: 0.0008, turnover: 0.35 },
  };

  const reb = rebalanceConfig[styleId];
  const weightedAnnualFee = ASSET_CLASS_ORDER.reduce(
    (sum, k) => sum + finalWeights[k] * assetSpecs[k].annualFee,
    0
  );

  const overlapWarnings: string[] = [];
  if (finalWeights.equity_index > 0 && finalWeights.quality_stock > 0) {
    overlapWarnings.push(
      '분산 주가지수 ETF와 개별 우량주 후보를 함께 보유하면 동일 대형주(예: 삼성전자, 미국 빅테크 등)에 중복 노출될 수 있습니다.'
    );
  }
  if (finalWeights.equity_index + finalWeights.gold > 0.4) {
    overlapWarnings.push(
      '해외 주가지수·금 자산은 원/달러 환율 변동에 노출되므로 원화 기준 평가액이 현지 지수와 다르게 움직일 수 있습니다.'
    );
  }

  // Analytical 1-year rough stress check against user's loss budget ratio
  const lossBudgetRatio =
    riskInput.lossBudgetReferenceCapital > 0
      ? riskInput.lossBudgetMaxAmount / riskInput.lossBudgetReferenceCapital
      : 0.1;

  const roughPortVol = Math.sqrt(
    ASSET_CLASS_ORDER.reduce(
      (acc, k) => acc + Math.pow(finalWeights[k] * assetSpecs[k].annualLogVolatility, 2),
      0
    )
  );
  // Rough 1-year 5th percentile drop check (~1.645 sigma)
  const roughPortReturn = ASSET_CLASS_ORDER.reduce(
    (acc, k) => acc + finalWeights[k] * assetSpecs[k].annualSimpleReturn,
    0
  );
  const rough1yP5Return = roughPortReturn - 1.645 * roughPortVol;
  const candidateSatisfiesLossBudget = rough1yP5Return >= -lossBudgetRatio;

  const adjustmentSuggestions: string[] = [];
  if (!candidateSatisfiesLossBudget) {
    adjustmentSuggestions.push(
      `입력하신 손실 감당 기준(${Math.round(lossBudgetRatio * 100)}%) 대비 1년 하락 시나리오(하위 5%)의 변동 폭이 더 클 수 있습니다.`
    );
    adjustmentSuggestions.push('주식·개별주 비중을 낮추고 현금성·채권 비중을 높이거나, 투자금·월 적립 규모를 보수적으로 조정하는 방안을 비교해 보세요.');
  }
  if (analysis.emergencyShortfall > 0) {
    adjustmentSuggestions.push('비상자금 부족분 확보 전까지는 추가 투자금 투입보다 안전 유동성 확보가 우선입니다.');
  }

  return {
    profileId,
    styleId,
    assetWeights: finalWeights,
    unconstrainedStyleWeights: styleCompute.unconstrained,
    wasConstrainedByRisk: customWeights ? false : styleCompute.wasConstrained,
    constraintNote: customWeights
      ? '사용자가 직접 수정한 자산 배분 비중이 적용되었습니다 (합계 100%).'
      : styleCompute.constraintNote,
    holdings,
    rebalanceMode: reb.mode,
    rebalanceCostRate: reb.cost,
    expectedAnnualTurnover: reb.turnover,
    weightedAnnualFee,
    horizonFitness,
    overlapWarnings,
    candidateSatisfiesLossBudget,
    adjustmentSuggestions,
  };
}
