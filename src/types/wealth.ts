export type RiskProfileId = 'conservative' | 'moderate' | 'aggressive';
export type InvestorStyleId = 'balanced_core' | 'buffett' | 'lynch' | 'druckenmiller';
export type AssetClassId = 'cash' | 'bond' | 'equity_index' | 'gold' | 'quality_stock';
export type DataMode = 'dev_assumption' | 'historical_sample' | 'user_custom';
export type SimulationMode = 'parametric' | 'bootstrap';
export type IncomeStability = 'high' | 'medium' | 'low';
export type InvestmentExperience = 'none' | 'basic' | 'experienced';
export type FitGrade = '적합' | '보통' | '주의';

export interface DebtItem {
  id: string;
  name: string;
  balance: number;
  annualRate: number; // 0.045 = 4.5%
  monthlyPayment: number;
  includedInEssentialExpense: boolean;
}

export interface PlannedWithdrawal {
  id: string;
  label: string;
  monthIndex: number; // 1..totalMonths
  amount: number;
}

export interface CashflowInput {
  // Demographics & Goals
  currentAge: number;
  retireAge: number;
  targetAmount: number;
  emergencyTargetMonths: number;
  // Income & Growth
  monthlyNetIncome: number;
  incomeStability: IncomeStability;
  annualIncomeGrowthRate: number;
  annualInflationRate: number;
  // Monthly Expenses
  housingExpense: number;
  foodExpense: number;
  transportExpense: number;
  insuranceExpense: number;
  otherEssentialExpense: number;
  discretionaryExpense: number;
  annualIrregularExpense: number;
  annualExpenseGrowthRate: number;
  // Debts
  debts: DebtItem[];
  // Existing Assets & Liquidity
  cashAndDeposits: number;
  existingInvestments: number;
  lockedAssets: number; // e.g., Jeonse deposit, real estate - excluded from investable cash
  nearTermGoalCash: number; // e.g., tuition, upcoming deposit top-up
  // Investment Plan
  surplusInvestRatio: number; // 0..1
  initialInvestOverride: number | null;
  monthlyInvestOverride: number | null;
  plannedWithdrawals: PlannedWithdrawal[];
  contributionPauseStartMonth: number | null;
  contributionPauseMonths: number;
}

export interface RiskAssessmentInput {
  lossReactionScore: number; // 1 (sell all) .. 5 (buy more)
  experience: InvestmentExperience;
  volatilityPreferenceScore: number; // 1..5
  lossBudgetReferenceCapital: number; // e.g., 10,000,000
  lossBudgetMaxAmount: number; // e.g., 1,000,000
  userProfileOverride: RiskProfileId | null;
}

export interface CashflowAnalysis {
  essentialMonthlyTotal: number;
  irregularMonthlyReserve: number;
  additionalDebtMonthlyPayment: number;
  totalMonthlyOutflow: number;
  monthlySurplus: number;
  isDeficit: boolean;
  monthlyDebtInterestEstimate: number;
  emergencyTargetAmount: number;
  nearTermReservedAmount: number;
  liquidCashTotal: number;
  existingEmergencyCoverageAmount: number;
  emergencyShortfall: number;
  availableCashAfterProtection: number;
  recommendedInitialInvestment: number;
  recommendedMonthlyInvestment: number;
  appliedInitialInvestment: number;
  appliedMonthlyInvestment: number;
  totalFinancialAssets: number;
  totalDebtBalance: number;
  netWorthIncludingLocked: number;
  monthlyDebtServiceRatio: number;
  statusFlags: {
    deficit: boolean;
    emergencyInsufficient: boolean;
    highDebtBurden: boolean;
  };
  breakdownLines: Array<{
    label: string;
    amount: number;
    note: string;
    category: 'income' | 'outflow' | 'protection' | 'investment';
  }>;
}

export interface RiskEvaluationResult {
  willingnessScore: number; // 0..100
  capacityScore: number; // 0..100
  combinedScore: number; // 0..100
  willingnessProfile: RiskProfileId;
  capacityProfile: RiskProfileId;
  recommendedProfile: RiskProfileId;
  appliedProfile: RiskProfileId;
  reasons: string[];
  capacityCapped: boolean;
}

export interface AssetClassSpec {
  id: AssetClassId;
  label: string;
  color: string;
  annualSimpleReturn: number;
  annualLogVolatility: number;
  annualFee: number;
  dividendYield: number;
  currency: 'KRW' | 'USD';
  fxExposed: boolean;
  annualFxReturn: number; // expected KRW depreciation(+)/appreciation(-) vs foreign currency
  annualFxVolatility: number;
  riskSummary: string;
  sourceName: string;
  sourceUrl: string;
  asOfDate: string;
}

export interface InstrumentCandidate {
  id: string;
  assetClass: AssetClassId;
  name: string;
  ticker: string;
  market: string;
  isVirtualModelAsset: boolean;
  role: string;
  selectionReason: string;
  keyRisks: string[];
  currency: 'KRW' | 'USD';
  fxHedged: boolean | null; // null if KRW domestic or N/A
  expenseRatioLabel: string; // e.g., "0.07%" or "미확인(공식 공시 확인 필요)"
  expenseRatioNumeric: number | null;
  asOfDate: string;
  officialSourceName: string;
  officialSourceUrl: string;
  qualityCriteria?: string[];
  overlapNote?: string;
  supportedStyles: InvestorStyleId[];
}

export interface HoldingAllocation {
  instrumentId: string;
  name: string;
  ticker: string;
  assetClass: AssetClassId;
  weightPct: number; // 0..100, exact integer or 1-decimal sum to 100
  amountKRW: number;
  color: string;
}

export interface PortfolioRecommendation {
  profileId: RiskProfileId;
  styleId: InvestorStyleId;
  assetWeights: Record<AssetClassId, number>; // sum === 1.0
  unconstrainedStyleWeights: Record<AssetClassId, number>;
  wasConstrainedByRisk: boolean;
  constraintNote: string;
  holdings: HoldingAllocation[];
  rebalanceMode: 'quarterly' | 'semiannual' | 'annual' | 'signal_tactical';
  rebalanceCostRate: number;
  expectedAnnualTurnover: number;
  weightedAnnualFee: number;
  horizonFitness: {
    short: FitGrade;
    mid: FitGrade;
    long: FitGrade;
    reason: string;
  };
  overlapWarnings: string[];
  candidateSatisfiesLossBudget: boolean;
  adjustmentSuggestions: string[];
}

export interface MilestoneStats {
  label: string;
  monthIndex: number;
  yearsElapsed: number;
  totalContributedMean: number;
  totalWithdrawnMean: number;
  nominalMean: number;
  nominalMedian: number;
  nominalP5: number;
  nominalP25: number;
  nominalP75: number;
  nominalP95: number;
  realMean: number;
  realMedian: number;
  realP5: number;
  realP95: number;
  meanProfit: number;
  medianProfit: number;
  twrTotalReturnMedian: number;
  twrTotalReturnMean: number;
  twrTotalReturnP5: number;
  twrAnnualizedMedian: number;
  twrAnnualizedP5: number;
  lossVsNetPrincipalProb: number; // 0..1
  targetAchievedProb: number; // 0..1
  lossBudgetExceededProb: number; // 0..1
  maxDrawdownMedian: number; // 0..1 positive magnitude
  maxDrawdownP95Worst: number; // 0..1
  shortfallPathProb: number; // 0..1
  constantReturnBenchmarkValue: number;
}

export interface FanSeriesPoint {
  monthIndex: number;
  age: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  realP50: number;
  constantBenchmark: number;
}

export interface SinglePathPoint {
  monthIndex: number;
  age: number;
  nominalBalance: number;
  realBalance: number;
  netContributed: number;
  unitNav: number; // Starts at 1.0, tracks TWR independent of cashflows
  drawdown: number;
  shortfallAmount: number;
  weightsByAsset: Record<AssetClassId, number>;
  signalLabel?: string;
}

export interface SimulationOutput {
  runCount: number;
  seed: number;
  mode: SimulationMode;
  dataMode: DataMode;
  stressScenario: boolean;
  modelVersion: string;
  dataVersion: string;
  totalMonths: number;
  horizonYears: number;
  constantComparisonRate: number;
  assetSpecsUsed: Record<AssetClassId, AssetClassSpec>;
  portfolioUsed: PortfolioRecommendation;
  milestones: {
    oneYear: MilestoneStats | null;
    tenYear: MilestoneStats | null;
    horizonEnd: MilestoneStats;
  };
  fanSeries: FanSeriesPoint[];
  selectedPathIndex: number;
  selectedPath: SinglePathPoint[];
  selectedPathMaxDrawdown: number;
  selectedPathTwrTotal: number;
  selectedPathShortfalls: number;
  finalValuesSorted: number[];
  monteCarloSeAtLossProb: number;
  elapsedMs: number;
}

export interface HistoricalMonthlyRow {
  date: string; // YYYY-MM
  returns: Record<AssetClassId, number>; // KRW total monthly simple return
}

export interface BacktestWindowResult {
  windowLabel: string;
  startDate: string;
  endDate: string;
  months: number;
  styleId: InvestorStyleId;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  endingValueOn10M: number;
}
