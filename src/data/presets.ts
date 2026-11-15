import { CashflowInput, RiskAssessmentInput } from '../types/wealth';

export interface DemoPersona {
  id: string;
  title: string;
  subtitle: string;
  cashflow: CashflowInput;
  risk: RiskAssessmentInput;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'rookie_26',
    title: '예시 1 · 사회초년생 (26세)',
    subtitle: '세후 280만 원 · 학자금 대출 · 비상자금부터 채워야 하는 단계',
    cashflow: {
      currentAge: 26,
      retireAge: 60,
      targetAmount: 300_000_000,
      emergencyTargetMonths: 3,
      monthlyNetIncome: 2_800_000,
      incomeStability: 'medium',
      annualIncomeGrowthRate: 0.03,
      annualInflationRate: 0.025,
      housingExpense: 650_000,
      foodExpense: 480_000,
      transportExpense: 140_000,
      insuranceExpense: 120_000,
      otherEssentialExpense: 160_000,
      discretionaryExpense: 350_000,
      annualIrregularExpense: 2_400_000,
      annualExpenseGrowthRate: 0.025,
      debts: [
        {
          id: 'd_student',
          name: '학자금 대출',
          balance: 14_000_000,
          annualRate: 0.017,
          monthlyPayment: 220_000,
          includedInEssentialExpense: false,
        },
      ],
      cashAndDeposits: 3_500_000,
      existingInvestments: 1_000_000,
      lockedAssets: 10_000_000, // 원룸 보증금
      nearTermGoalCash: 1_500_000, // 자격증·이사 비용
      surplusInvestRatio: 0.7,
      initialInvestOverride: null,
      monthlyInvestOverride: null,
      plannedWithdrawals: [],
      contributionPauseStartMonth: null,
      contributionPauseMonths: 0,
    },
    risk: {
      lossReactionScore: 3,
      experience: 'none',
      volatilityPreferenceScore: 3,
      lossBudgetReferenceCapital: 10_000_000,
      lossBudgetMaxAmount: 1_000_000,
      userProfileOverride: null,
    },
  },
  {
    id: 'office_30',
    title: '예시 2 · 3년차 직장인 (30세)',
    subtitle: '세후 380만 원 · 전세보증금(잠김) 5천만 원 · 본격 장기 적립 단계',
    cashflow: {
      currentAge: 30,
      retireAge: 60,
      targetAmount: 500_000_000,
      emergencyTargetMonths: 4,
      monthlyNetIncome: 3_800_000,
      incomeStability: 'high',
      annualIncomeGrowthRate: 0.035,
      annualInflationRate: 0.025,
      housingExpense: 450_000, // 전세대출 이자 포함 주거 관리비
      foodExpense: 550_000,
      transportExpense: 160_000,
      insuranceExpense: 150_000,
      otherEssentialExpense: 200_000,
      discretionaryExpense: 450_000,
      annualIrregularExpense: 3_600_000,
      annualExpenseGrowthRate: 0.025,
      debts: [
        {
          id: 'd_jeonse',
          name: '전세자금대출 (이자 월 주거비에 포함)',
          balance: 80_000_000,
          annualRate: 0.036,
          monthlyPayment: 240_000,
          includedInEssentialExpense: true,
        },
      ],
      cashAndDeposits: 22_000_000,
      existingInvestments: 8_000_000,
      lockedAssets: 50_000_000, // 반환 전 전세보증금
      nearTermGoalCash: 3_000_000,
      surplusInvestRatio: 0.8,
      initialInvestOverride: null,
      monthlyInvestOverride: null,
      plannedWithdrawals: [
        {
          id: 'w_wedding',
          label: '5년 후 주택·결혼 자금 일부 인출',
          monthIndex: 60,
          amount: 20_000_000,
        },
      ],
      contributionPauseStartMonth: null,
      contributionPauseMonths: 0,
    },
    risk: {
      lossReactionScore: 4,
      experience: 'basic',
      volatilityPreferenceScore: 4,
      lossBudgetReferenceCapital: 10_000_000,
      lossBudgetMaxAmount: 1_500_000,
      userProfileOverride: null,
    },
  },
  {
    id: 'freelancer_33',
    title: '예시 3 · 프리랜서 (33세)',
    subtitle: '소득 변동성 큼 · 높은 위험 선호지만 손실 감당 능력은 보수적 조정',
    cashflow: {
      currentAge: 33,
      retireAge: 62,
      targetAmount: 600_000_000,
      emergencyTargetMonths: 6,
      monthlyNetIncome: 4_500_000,
      incomeStability: 'low',
      annualIncomeGrowthRate: 0.02,
      annualInflationRate: 0.025,
      housingExpense: 950_000,
      foodExpense: 600_000,
      transportExpense: 180_000,
      insuranceExpense: 220_000,
      otherEssentialExpense: 250_000,
      discretionaryExpense: 600_000,
      annualIrregularExpense: 6_000_000, // 세금·장비 교체 등
      annualExpenseGrowthRate: 0.025,
      debts: [
        {
          id: 'd_credit',
          name: '신용대출',
          balance: 18_000_000,
          annualRate: 0.062,
          monthlyPayment: 550_000,
          includedInEssentialExpense: false,
        },
      ],
      cashAndDeposits: 16_000_000,
      existingInvestments: 5_000_000,
      lockedAssets: 20_000_000,
      nearTermGoalCash: 4_000_000,
      surplusInvestRatio: 0.65,
      initialInvestOverride: null,
      monthlyInvestOverride: null,
      plannedWithdrawals: [],
      contributionPauseStartMonth: 24,
      contributionPauseMonths: 6, // 2년 차 6개월 소득 공백 가정
    },
    risk: {
      lossReactionScore: 5,
      experience: 'experienced',
      volatilityPreferenceScore: 5,
      lossBudgetReferenceCapital: 10_000_000,
      lossBudgetMaxAmount: 1_000_000,
      userProfileOverride: null,
    },
  },
];
