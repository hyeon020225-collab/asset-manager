import { INVESTOR_STYLES } from '../data/instruments';
import {
  CashflowAnalysis,
  CashflowInput,
  PortfolioRecommendation,
  RiskEvaluationResult,
  SimulationOutput,
} from '../types/wealth';

export interface ExtractedCashflowCandidate {
  extractedFields: Partial<CashflowInput>;
  notes: string[];
  missingQuestions: string[];
  sourceMode: 'rule_based' | 'gemini_ai';
}

/**
 * Deterministic rule-based parser for Korean natural language financial text.
 * Works completely offline without any API key.
 */
export function extractCashflowRuleBased(text: string): ExtractedCashflowCandidate {
  const extracted: Partial<CashflowInput> = {};
  const notes: string[] = [];
  const missingQuestions: string[] = [];

  const parseKoreanMoney = (rawNum: string, unit: string): number => {
    const val = Number(rawNum.replace(/,/g, ''));
    if (!Number.isFinite(val)) return 0;
    if (unit.includes('억')) return Math.round(val * 100_000_000);
    if (unit.includes('만')) return Math.round(val * 10_000);
    return Math.round(val);
  };

  const ageMatch = text.match(/(\d{2})\s*(?:살|세)/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    if (age >= 18 && age <= 75) {
      extracted.currentAge = age;
      notes.push(`현재 나이: ${age}세`);
    }
  } else {
    missingQuestions.push('현재 나이와 은퇴 목표 나이를 알려주시겠어요?');
  }

  const incomeMatch = text.match(/(?:월급|소득|월\s*수입|세후)\s*[^\d]{0,6}([\d,.]+)\s*(억|만\s*원|만원|원)?/);
  if (incomeMatch) {
    const amt = parseKoreanMoney(incomeMatch[1], incomeMatch[2] ?? '만원');
    if (amt > 0) {
      extracted.monthlyNetIncome = amt;
      notes.push(`세후 월소득 후보: ${amt.toLocaleString('ko-KR')}원`);
    }
  } else {
    missingQuestions.push('세후 월소득은 대략 얼마인가요?');
  }

  const rentMatch = text.match(/(?:월세|주거비|관리비)\s*[^\d]{0,6}([\d,.]+)\s*(억|만\s*원|만원|원)?/);
  if (rentMatch) {
    const amt = parseKoreanMoney(rentMatch[1], rentMatch[2] ?? '만원');
    if (amt > 0) {
      extracted.housingExpense = amt;
      notes.push(`주거비 후보: ${amt.toLocaleString('ko-KR')}원`);
    }
  }

  const livingMatch = text.match(/(?:생활비|식비|지출)\s*[^\d]{0,6}([\d,.]+)\s*(억|만\s*원|만원|원)?/);
  if (livingMatch) {
    const amt = parseKoreanMoney(livingMatch[1], livingMatch[2] ?? '만원');
    if (amt > 0) {
      extracted.foodExpense = Math.round(amt * 0.5);
      extracted.discretionaryExpense = Math.round(amt * 0.5);
      notes.push(`생활비(식비/선택지출 분할) 후보: ${amt.toLocaleString('ko-KR')}원`);
    }
  }

  const depositMatch = text.match(/(?:전세|보증금)\s*[^\d]{0,6}([\d,.]+)\s*(억|만\s*원|만원|원)?/);
  if (depositMatch) {
    const amt = parseKoreanMoney(depositMatch[1], depositMatch[2] ?? '만원');
    if (amt > 0) {
      extracted.lockedAssets = amt;
      notes.push(`사용 불가 보증금 후보: ${amt.toLocaleString('ko-KR')}원`);
    }
  }

  const savingsMatch = text.match(/(?:모은\s*돈|현금|예금|저축액|자산)\s*[^\d]{0,6}([\d,.]+)\s*(억|만\s*원|만원|원)?/);
  if (savingsMatch) {
    const amt = parseKoreanMoney(savingsMatch[1], savingsMatch[2] ?? '만원');
    if (amt > 0) {
      extracted.cashAndDeposits = amt;
      notes.push(`현금·예금 후보: ${amt.toLocaleString('ko-KR')}원`);
    }
  } else {
    missingQuestions.push('현재 보유 중인 현금·예금과 단기 내 쓸 자금(보증금·학비 등)이 있나요?');
  }

  if (text.includes('대출') || text.includes('학자금') || text.includes('빚')) {
    missingQuestions.push('보유 중인 대출의 잔액, 연 금리, 월 상환액을 별도 부채 목록에 입력해 주세요.');
  }

  if (notes.length === 0) {
    missingQuestions.push('예: "29세, 월급 330만원, 월세 60만원, 생활비 90만원, 현금 1500만원, 보증금 2000만원"처럼 숫자와 함께 적어보세요.');
  }

  return {
    extractedFields: extracted,
    notes,
    missingQuestions,
    sourceMode: 'rule_based',
  };
}

/**
 * Generates a transparent, strictly deterministic rule-based explanation
 * grounded in actual computed outputs.
 */
export function buildRuleBasedExplanation(
  analysis: CashflowAnalysis,
  riskEval: RiskEvaluationResult,
  portfolio: PortfolioRecommendation,
  simulation: SimulationOutput
): string {
  const styleMeta = INVESTOR_STYLES[portfolio.styleId];
  const end = simulation.milestones.horizonEnd;
  const lines: string[] = [];

  if (analysis.isDeficit) {
    lines.push(
      `현재 월 현금흐름은 ${Math.round(analysis.monthlySurplus).toLocaleString('ko-KR')}원 적자이므로, 위험자산 신규 투자보다 지출 조정이 우선입니다.`
    );
  } else if (analysis.emergencyShortfall > 0) {
    lines.push(
      `월 잉여현금흐름은 +${Math.round(analysis.monthlySurplus).toLocaleString('ko-KR')}원이나, 목표 비상자금까지 ${Math.round(analysis.emergencyShortfall).toLocaleString('ko-KR')}원이 부족해 우선 보호가 필요합니다.`
    );
  } else {
    lines.push(
      `비상자금(${Math.round(analysis.emergencyTargetAmount).toLocaleString('ko-KR')}원)과 단기 자금을 보호한 뒤, 초기 ${Math.round(analysis.appliedInitialInvestment).toLocaleString('ko-KR')}원 · 월 ${Math.round(analysis.appliedMonthlyInvestment).toLocaleString('ko-KR')}원을 장기 투자에 배분할 수 있습니다.`
    );
  }

  lines.push(
    `심리적 위험 성향 점수(${riskEval.willingnessScore}점)와 실제 재무 여건 점수(${riskEval.capacityScore}점)를 함께 반영해 '${
      riskEval.appliedProfile === 'conservative'
        ? '보수형'
        : riskEval.appliedProfile === 'moderate'
        ? '중립형'
        : '위험감수형'
    }'으로 분류하고, ${styleMeta.name} 규칙을 적용했습니다.`
  );

  lines.push(
    `${simulation.horizonYears}년(${simulation.runCount.toLocaleString('ko-KR')}회 모의실험) 기준 평가액 중앙값은 ${Math.round(end.nominalMedian).toLocaleString('ko-KR')}원(물가 반영 현재가치 ${Math.round(end.realMedian).toLocaleString('ko-KR')}원)이며, 하위 5% 하락 시나리오는 ${Math.round(end.nominalP5).toLocaleString('ko-KR')}원, 순투입 원금 미만 비율은 ${(end.lossVsNetPrincipalProb * 100).toFixed(1)}%입니다.`
  );

  return lines.join(' ');
}
