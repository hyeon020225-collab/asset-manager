import { CashflowAnalysis, CashflowInput } from '../types/wealth';

function clampNonNegative(val: number): number {
  return Number.isFinite(val) && val > 0 ? val : 0;
}

export function validateCashflowInput(input: CashflowInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.currentAge) || input.currentAge < 15 || input.currentAge > 85) {
    errors.push('현재 나이는 15세~85세 사이여야 합니다.');
  }
  if (!Number.isFinite(input.retireAge) || input.retireAge <= input.currentAge || input.retireAge > 100) {
    errors.push('은퇴 예정 나이는 현재 나이보다 크고 100세 이하여야 합니다.');
  }
  if (!Number.isFinite(input.monthlyNetIncome) || input.monthlyNetIncome < 0) {
    errors.push('세후 월소득은 0원 이상이어야 합니다.');
  }
  if (!Number.isFinite(input.emergencyTargetMonths) || input.emergencyTargetMonths < 0 || input.emergencyTargetMonths > 24) {
    errors.push('비상자금 목표 개월 수는 0~24개월 사이여야 합니다.');
  }
  return errors;
}

export function analyzeCashflow(input: CashflowInput): CashflowAnalysis {
  const monthlyIncome = clampNonNegative(input.monthlyNetIncome);
  const essentialBase =
    clampNonNegative(input.housingExpense) +
    clampNonNegative(input.foodExpense) +
    clampNonNegative(input.transportExpense) +
    clampNonNegative(input.insuranceExpense) +
    clampNonNegative(input.otherEssentialExpense);

  const discretionary = clampNonNegative(input.discretionaryExpense);
  const irregularMonthlyReserve = clampNonNegative(input.annualIrregularExpense) / 12;

  // Prevent double-counting debts already included in essential expenses
  let additionalDebtMonthlyPayment = 0;
  let totalDebtBalance = 0;
  let totalDebtMonthlyService = 0;
  let monthlyDebtInterestEstimate = 0;

  for (const debt of input.debts) {
    const bal = clampNonNegative(debt.balance);
    const rate = clampNonNegative(debt.annualRate);
    const pmt = clampNonNegative(debt.monthlyPayment);
    totalDebtBalance += bal;
    totalDebtMonthlyService += pmt;
    monthlyDebtInterestEstimate += (bal * rate) / 12;
    if (!debt.includedInEssentialExpense) {
      additionalDebtMonthlyPayment += pmt;
    }
  }

  const totalMonthlyOutflow =
    essentialBase + discretionary + irregularMonthlyReserve + additionalDebtMonthlyPayment;
  const monthlySurplus = monthlyIncome - totalMonthlyOutflow;
  const isDeficit = monthlySurplus <= 0;

  // Emergency target is based on essential living cost + additional debt payment + irregular reserve
  const monthlyCoreNeed = essentialBase + additionalDebtMonthlyPayment + irregularMonthlyReserve;
  const emergencyTargetAmount = Math.round(
    monthlyCoreNeed * clampNonNegative(input.emergencyTargetMonths)
  );

  // Exclude locked assets (e.g., Jeonse deposit, real estate) from liquid cash
  const liquidCashTotal = clampNonNegative(input.cashAndDeposits);
  const existingInvestments = clampNonNegative(input.existingInvestments);
  const nearTermRequested = clampNonNegative(input.nearTermGoalCash);

  // Allocate liquid cash sequentially without double-deducting:
  // 1) Near-term goal cash -> 2) Emergency fund -> 3) Remaining investable initial cash
  const nearTermReservedAmount = Math.min(liquidCashTotal, nearTermRequested);
  const cashRemainingAfterNearTerm = Math.max(0, liquidCashTotal - nearTermReservedAmount);
  const existingEmergencyCoverageAmount = Math.min(
    cashRemainingAfterNearTerm,
    emergencyTargetAmount
  );
  const emergencyShortfall = Math.max(
    0,
    emergencyTargetAmount - existingEmergencyCoverageAmount
  );
  const nearTermShortfall = Math.max(0, nearTermRequested - nearTermReservedAmount);

  const availableCashAfterProtection = Math.max(
    0,
    cashRemainingAfterNearTerm - emergencyTargetAmount
  );

  const investRatio = Math.min(1, Math.max(0, input.surplusInvestRatio));

  // If deficit or emergency shortfall exists, guide conservatively (recommended initial/monthly can be 0)
  const recommendedInitialInvestment =
    emergencyShortfall > 0 || nearTermShortfall > 0
      ? existingInvestments
      : Math.round(availableCashAfterProtection + existingInvestments);

  const recommendedMonthlyInvestment =
    isDeficit
      ? 0
      : emergencyShortfall > 0
      ? 0
      : Math.round(monthlySurplus * investRatio);

  const appliedInitialInvestment =
    input.initialInvestOverride !== null
      ? clampNonNegative(input.initialInvestOverride)
      : recommendedInitialInvestment;

  const appliedMonthlyInvestment =
    input.monthlyInvestOverride !== null
      ? clampNonNegative(input.monthlyInvestOverride)
      : recommendedMonthlyInvestment;

  const totalFinancialAssets = liquidCashTotal + existingInvestments;
  const lockedAssets = clampNonNegative(input.lockedAssets);
  const netWorthIncludingLocked = totalFinancialAssets + lockedAssets - totalDebtBalance;
  const monthlyDebtServiceRatio =
    monthlyIncome > 0 ? totalDebtMonthlyService / monthlyIncome : totalDebtMonthlyService > 0 ? 1 : 0;

  const breakdownLines: CashflowAnalysis['breakdownLines'] = [
    {
      label: '세후 월소득',
      amount: monthlyIncome,
      note: '매월 실제로 들어오는 가처분 근로/사업 소득',
      category: 'income',
    },
    {
      label: '월 필수 지출 (주거·식비·교통·보험·기타)',
      amount: -essentialBase,
      note: '생활 유지를 위해 매월 고정·필수로 지출되는 비용',
      category: 'outflow',
    },
    {
      label: '월 선택 지출 (여가·쇼핑 등)',
      amount: -discretionary,
      note: '조정 여지가 있는 소비성 지출',
      category: 'outflow',
    },
    {
      label: '연간·비정기 지출 월 적립 필요액',
      amount: -Math.round(irregularMonthlyReserve),
      note: `연 ${Math.round(input.annualIrregularExpense).toLocaleString('ko-KR')}원 ÷ 12개월`,
      category: 'outflow',
    },
    {
      label: '추가 월 부채 상환액 (필수지출 미포함분만)',
      amount: -additionalDebtMonthlyPayment,
      note: '이미 주거비/필수지출에 포함된 상환액과 이자는 중복 차감하지 않음',
      category: 'outflow',
    },
    {
      label: '월 잉여현금흐름',
      amount: Math.round(monthlySurplus),
      note: isDeficit ? '적자 상태: 투자보다 지출 조정이 우선입니다' : '저축·비상자금·투자에 활용할 수 있는 월 여력',
      category: 'income',
    },
    {
      label: '보호할 단기 예정 자금 (보증금·학비 등)',
      amount: nearTermRequested,
      note: '가까운 시일 내 사용 예정이므로 위험자산 투자에서 제외',
      category: 'protection',
    },
    {
      label: `비상자금 목표 (${input.emergencyTargetMonths}개월분)`,
      amount: emergencyTargetAmount,
      note: `현재 충당액 ${Math.round(existingEmergencyCoverageAmount).toLocaleString('ko-KR')}원 / 부족분 ${Math.round(emergencyShortfall).toLocaleString('ko-KR')}원`,
      category: 'protection',
    },
    {
      label: '추천 초기 투자 가능액 (기존 투자자산 포함)',
      amount: recommendedInitialInvestment,
      note:
        emergencyShortfall > 0
          ? '비상자금 부족분 확보 전까지는 현금 추가 투입을 보류하고 기존 투자자산만 반영'
          : '보호 자금 제외 여유 현금 + 기존 투자자산',
      category: 'investment',
    },
    {
      label: `추천 월 적립 투자액 (잉여자금의 ${Math.round(investRatio * 100)}%)`,
      amount: recommendedMonthlyInvestment,
      note:
        emergencyShortfall > 0
          ? '비상자금이 목표치에 도달할 때까지 월 적립 투자 추천액을 0원으로 보수 산정'
          : '월 잉여자금 × 투자 배분 비율',
      category: 'investment',
    },
  ];

  return {
    essentialMonthlyTotal: essentialBase,
    irregularMonthlyReserve,
    additionalDebtMonthlyPayment,
    totalMonthlyOutflow,
    monthlySurplus,
    isDeficit,
    monthlyDebtInterestEstimate,
    emergencyTargetAmount,
    nearTermReservedAmount,
    liquidCashTotal,
    existingEmergencyCoverageAmount,
    emergencyShortfall,
    availableCashAfterProtection,
    recommendedInitialInvestment,
    recommendedMonthlyInvestment,
    appliedInitialInvestment,
    appliedMonthlyInvestment,
    totalFinancialAssets,
    totalDebtBalance,
    netWorthIncludingLocked,
    monthlyDebtServiceRatio,
    statusFlags: {
      deficit: isDeficit,
      emergencyInsufficient: emergencyShortfall > 0 || nearTermShortfall > 0,
      highDebtBurden: monthlyDebtServiceRatio >= 0.3,
    },
    breakdownLines,
  };
}

export interface CashflowActionScenario {
  id: string;
  title: string;
  description: string;
  monthlyToEmergencyOrDebt: number;
  monthlyToInvestment: number;
  monthsToBuildEmergency: number | null;
}

export function buildCashflowActionScenarios(
  input: CashflowInput,
  analysis: CashflowAnalysis
): CashflowActionScenario[] {
  const scenarios: CashflowActionScenario[] = [];
  const reducedDiscretionary = Math.round(input.discretionaryExpense * 0.25);
  const adjustedSurplus = analysis.monthlySurplus + reducedDiscretionary;

  if (analysis.isDeficit) {
    scenarios.push({
      id: 'cut_spending',
      title: '1) 지출 조정 우선 시나리오',
      description: `선택 지출을 25%(월 ${reducedDiscretionary.toLocaleString('ko-KR')}원) 줄여 월 현금흐름 적자를 해소하는 경로입니다.`,
      monthlyToEmergencyOrDebt: Math.max(0, adjustedSurplus),
      monthlyToInvestment: 0,
      monthsToBuildEmergency:
        adjustedSurplus > 0 && analysis.emergencyShortfall > 0
          ? Math.ceil(analysis.emergencyShortfall / adjustedSurplus)
          : null,
    });
  }

  if (analysis.emergencyShortfall > 0) {
    const monthlyForEmergency = Math.max(0, Math.round(analysis.monthlySurplus));
    const monthsNeeded =
      monthlyForEmergency > 0 ? Math.ceil(analysis.emergencyShortfall / monthlyForEmergency) : null;
    scenarios.push({
      id: 'emergency_first',
      title: '2) 비상자금 100% 확보 후 투자 전환',
      description:
        monthsNeeded !== null
          ? `월 잉여자금 ${monthlyForEmergency.toLocaleString('ko-KR')}원을 먼저 비상자금에 채우면 약 ${monthsNeeded}개월 뒤부터 안전하게 투자를 시작할 수 있습니다.`
          : '현재 월 잉여가 없어 비상자금 적립을 위한 소득 증대 또는 지출 조정이 먼저 필요합니다.',
      monthlyToEmergencyOrDebt: monthlyForEmergency,
      monthlyToInvestment: 0,
      monthsToBuildEmergency: monthsNeeded,
    });
  }

  const highRateDebt = [...input.debts].sort((a, b) => b.annualRate - a.annualRate)[0];
  if (highRateDebt && highRateDebt.balance > 0) {
    scenarios.push({
      id: 'debt_vs_invest',
      title: '3) 고금리 부채 상환 vs 투자 병행',
      description: `${highRateDebt.name}(연 ${(highRateDebt.annualRate * 100).toFixed(1)}%) 상환은 확정 이자 절감 효과가 있습니다. 금리가 연 5% 이상이면 투자보다 원금 상환의 확실성이 높습니다.`,
      monthlyToEmergencyOrDebt: Math.max(0, Math.round(analysis.monthlySurplus * 0.5)),
      monthlyToInvestment: Math.max(0, Math.round(analysis.monthlySurplus * 0.5)),
      monthsToBuildEmergency: null,
    });
  }

  return scenarios;
}
