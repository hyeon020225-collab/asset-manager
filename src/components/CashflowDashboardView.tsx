import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { buildCashflowActionScenarios } from '../engine/cashflow';
import { CashflowAnalysis, CashflowInput } from '../types/wealth';
import { fmtKRW, fmtSignedKRW } from '../utils/formatters';

interface CashflowDashboardViewProps {
  cashflow: CashflowInput;
  analysis: CashflowAnalysis;
  onGoBack: () => void;
  onGoNext: () => void;
}

export function CashflowDashboardView({
  cashflow,
  analysis,
  onGoBack,
  onGoNext,
}: CashflowDashboardViewProps) {
  const [showBreakdown, setShowBreakdown] = useState(true);
  const scenarios = buildCashflowActionScenarios(cashflow, analysis);

  return (
    <div className="space-y-6">
      {/* Status Banner if Deficit or Emergency Fund Shortfall */}
      {(analysis.statusFlags.deficit || analysis.statusFlags.emergencyInsufficient) && (
        <section
          aria-label="재무 보호 상태 알림"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-1.5">
              <h2 className="text-sm font-bold text-amber-950">
                {analysis.statusFlags.deficit
                  ? '현재 월 현금흐름 적자 상태 — 생활비 안정이 우선입니다'
                  : '목표 비상자금 미달 상태 — 투자보다 안전자금 확보를 먼저 권고합니다'}
              </h2>
              <p className="text-xs leading-relaxed text-amber-900">
                생활에 필요한 돈과 비상자금이 확보되지 않은 상태에서 위험자산에 투자하면 급전이 필요할 때 손실을 본 채 매도해야 할 위험이 커집니다. 아래 권고 월 투자액이 0원으로 계산된 이유를 확인하고 대안 시나리오를 비교해 보세요.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Top 4 Core Cards: Separating Overall Balance Sheet vs Investable Account */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="block text-xs font-medium text-slate-500">월 잉여현금흐름</span>
          <span
            className={`mt-1.5 block font-mono text-xl font-bold tabular-nums ${
              analysis.isDeficit ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {fmtSignedKRW(analysis.monthlySurplus)}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            세후 소득 {fmtKRW(cashflow.monthlyNetIncome)} − 월 유출 {fmtKRW(analysis.totalMonthlyOutflow)}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="block text-xs font-medium text-slate-500">보호할 자금 (단기 + 비상자금)</span>
          <span className="mt-1.5 block font-mono text-xl font-bold text-slate-900 tabular-nums">
            {fmtKRW(analysis.nearTermReservedAmount + analysis.emergencyTargetAmount)}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {analysis.emergencyShortfall > 0
              ? `비상자금 부족분 ${fmtKRW(analysis.emergencyShortfall)}`
              : `비상자금 ${cashflow.emergencyTargetMonths}개월분 충당 완료`}
          </span>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <span className="block text-xs font-semibold text-[#1D4ED8]">
            적용 초기 투자계좌 잔액
          </span>
          <span className="mt-1.5 block font-mono text-xl font-bold text-[#1D4ED8] tabular-nums">
            {fmtKRW(analysis.appliedInitialInvestment)}
          </span>
          <span className="mt-1 block text-xs text-slate-600">
            권고액 {fmtKRW(analysis.recommendedInitialInvestment)} (기존 투자자산 포함)
          </span>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <span className="block text-xs font-semibold text-[#1D4ED8]">
            적용 월 적립 투자액
          </span>
          <span className="mt-1.5 block font-mono text-xl font-bold text-[#1D4ED8] tabular-nums">
            {fmtKRW(analysis.appliedMonthlyInvestment)}
          </span>
          <span className="mt-1 block text-xs text-slate-600">
            권고액 {fmtKRW(analysis.recommendedMonthlyInvestment)} (잉여자금의{' '}
            {Math.round(cashflow.surplusInvestRatio * 100)}%)
          </span>
        </div>
      </section>

      {/* Overall Balance Sheet vs Investable Account Separation */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900">
            전체 재무상태 vs 투자계좌 분리
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            전세보증금·주택처럼 당장 쓸 수 없는 자산은 순자산에 포함되지만, 투자 가능 현금에는 합산하지 않습니다.
          </p>

          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">현금·예금 (유동 현금)</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {fmtKRW(cashflow.cashAndDeposits)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">기존 투자자산</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {fmtKRW(cashflow.existingInvestments)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">사용 불가 자산 (전세보증금·주택)</dt>
              <dd className="font-mono font-medium text-slate-500 tabular-nums">
                {fmtKRW(cashflow.lockedAssets)} (투자 현금 제외)
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">총 부채 잔액</dt>
              <dd className="font-mono font-semibold text-rose-700 tabular-nums">
                -{fmtKRW(analysis.totalDebtBalance)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5 font-semibold">
              <dt className="text-slate-900">전체 추정 순자산</dt>
              <dd className="font-mono text-slate-900 tabular-nums">
                {fmtKRW(analysis.netWorthIncludingLocked)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Action Scenarios Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900">
            현금흐름 · 비상자금 · 부채 우선순위 비교
          </h2>
          {scenarios.length === 0 ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <strong>안정적인 현금흐름 상태입니다.</strong>
                <p className="mt-1 leading-relaxed">
                  단기 자금과 비상자금({cashflow.emergencyTargetMonths}개월분)을 모두 보호한 뒤에도 매월{' '}
                  <strong className="font-mono">{fmtKRW(analysis.monthlySurplus)}</strong>의 여력이 있습니다. 이 중{' '}
                  <strong className="font-mono">{Math.round(cashflow.surplusInvestRatio * 100)}%</strong>인{' '}
                  <strong className="font-mono">{fmtKRW(analysis.recommendedMonthlyInvestment)}</strong>을 장기 투자에 배분합니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {scenarios.map((sc) => (
                <div key={sc.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-900">{sc.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{sc.description}</p>
                  <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-slate-700 tabular-nums">
                    <span>비상·상환 월 배분: {fmtKRW(sc.monthlyToEmergencyOrDebt)}</span>
                    <span>월 투자 배분: {fmtKRW(sc.monthlyToInvestment)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Expandable KRW Breakdown */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <button
          type="button"
          aria-expanded={showBreakdown}
          onClick={() => setShowBreakdown((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900">
              계산 근거 원화 상세 내역
            </h2>
            <p className="text-xs text-slate-500">
              중복 차감 없이 각 금액이 어떻게 산출되었는지 한 줄씩 확인합니다.
            </p>
          </div>
          {showBreakdown ? (
            <ChevronUp className="h-5 w-5 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-500" aria-hidden="true" />
          )}
        </button>

        {showBreakdown && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">항목</th>
                  <th className="py-2 px-4 text-right font-medium">원화 금액</th>
                  <th className="py-2 pl-4 font-medium">산출 근거</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analysis.breakdownLines.map((line, i) => (
                  <tr key={i} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-4 font-semibold text-slate-800">{line.label}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                        line.amount < 0
                          ? 'text-rose-700'
                          : line.category === 'investment'
                          ? 'text-[#1D4ED8]'
                          : 'text-slate-900'
                      }`}
                    >
                      {line.amount < 0 ? fmtSignedKRW(line.amount) : fmtKRW(line.amount)}
                    </td>
                    <td className="py-2.5 pl-4 text-slate-600">{line.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onGoBack}
          className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← 입력 수정하기
        </button>
        <button
          type="button"
          onClick={onGoNext}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
        >
          <span>3. 성향 평가 및 포트폴리오 보기</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
