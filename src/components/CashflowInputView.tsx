import { useState } from 'react';
import { ArrowRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { DEMO_PERSONAS } from '../data/presets';
import { ExtractedCashflowCandidate, extractCashflowRuleBased } from '../engine/ruleAssistant';
import { CashflowInput, DebtItem, IncomeStability, PlannedWithdrawal } from '../types/wealth';
import { fmtKRW } from '../utils/formatters';

interface CashflowInputViewProps {
  cashflow: CashflowInput;
  validationErrors: string[];
  aiAvailable: boolean;
  onChangeCashflow: (next: CashflowInput) => void;
  onApplyPreset: (presetId: string) => void;
  onGoNext: () => void;
}

function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-slate-700">
          {label}
        </label>
        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
          {fmtKRW(value)}
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="number"
          min={0}
          step={10_000}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white pr-9 pl-3 py-2 font-mono text-sm font-medium text-slate-900 tabular-nums focus:border-[#1D4ED8] focus:outline-2 focus:outline-[#1D4ED8]/20"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">
          원
        </span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function CashflowInputView({
  cashflow,
  validationErrors,
  aiAvailable,
  onChangeCashflow,
  onApplyPreset,
  onGoNext,
}: CashflowInputViewProps) {
  const [nlText, setNlText] = useState('');
  const [candidate, setCandidate] = useState<ExtractedCashflowCandidate | null>(null);
  const [extracting, setExtracting] = useState(false);

  const updateField = <K extends keyof CashflowInput>(key: K, val: CashflowInput[K]) => {
    onChangeCashflow({ ...cashflow, [key]: val });
  };

  const handleExtractFromText = async () => {
    if (!nlText.trim()) return;
    setExtracting(true);
    try {
      if (aiAvailable) {
        const res = await fetch('/api/ai/extract-cashflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: nlText }),
        });
        if (res.ok) {
          const data = await res.json();
          const fields: Partial<CashflowInput> = {};
          const notes: string[] = Array.isArray(data.notes) ? data.notes : [];
          if (typeof data.currentAge === 'number') fields.currentAge = data.currentAge;
          if (typeof data.monthlyNetIncome === 'number') fields.monthlyNetIncome = data.monthlyNetIncome;
          if (typeof data.housingExpense === 'number') fields.housingExpense = data.housingExpense;
          if (typeof data.foodExpense === 'number') fields.foodExpense = data.foodExpense;
          if (typeof data.discretionaryExpense === 'number') fields.discretionaryExpense = data.discretionaryExpense;
          if (typeof data.cashAndDeposits === 'number') fields.cashAndDeposits = data.cashAndDeposits;
          if (typeof data.lockedAssets === 'number') fields.lockedAssets = data.lockedAssets;
          if (typeof data.nearTermGoalCash === 'number') fields.nearTermGoalCash = data.nearTermGoalCash;

          setCandidate({
            extractedFields: fields,
            notes,
            missingQuestions: Array.isArray(data.missingQuestions) ? data.missingQuestions : [],
            sourceMode: 'gemini_ai',
          });
          setExtracting(false);
          return;
        }
      }
      setCandidate(extractCashflowRuleBased(nlText));
    } catch {
      setCandidate(extractCashflowRuleBased(nlText));
    } finally {
      setExtracting(false);
    }
  };

  const applyCandidate = () => {
    if (!candidate) return;
    onChangeCashflow({
      ...cashflow,
      ...candidate.extractedFields,
    });
    setCandidate(null);
  };

  const addDebt = () => {
    const nextDebt: DebtItem = {
      id: `debt_${Date.now()}`,
      name: '새 부채',
      balance: 5_000_000,
      annualRate: 0.05,
      monthlyPayment: 150_000,
      includedInEssentialExpense: false,
    };
    updateField('debts', [...cashflow.debts, nextDebt]);
  };

  const updateDebt = (idx: number, patch: Partial<DebtItem>) => {
    const next = cashflow.debts.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    updateField('debts', next);
  };

  const removeDebt = (idx: number) => {
    updateField(
      'debts',
      cashflow.debts.filter((_, i) => i !== idx)
    );
  };

  const addWithdrawal = () => {
    const maxMonths = Math.max(12, (cashflow.retireAge - cashflow.currentAge) * 12);
    const nextW: PlannedWithdrawal = {
      id: `w_${Date.now()}`,
      label: '예정 목돈 인출',
      monthIndex: Math.min(maxMonths, 36),
      amount: 10_000_000,
    };
    updateField('plannedWithdrawals', [...cashflow.plannedWithdrawals, nextW]);
  };

  const updateWithdrawal = (idx: number, patch: Partial<PlannedWithdrawal>) => {
    const next = cashflow.plannedWithdrawals.map((w, i) => (i === idx ? { ...w, ...patch } : w));
    updateField('plannedWithdrawals', next);
  };

  const removeWithdrawal = (idx: number) => {
    updateField(
      'plannedWithdrawals',
      cashflow.plannedWithdrawals.filter((_, i) => i !== idx)
    );
  };

  const horizonYears = Math.max(1, cashflow.retireAge - cashflow.currentAge);

  return (
    <div className="space-y-6">
      {/* Start Screen Overview & 3 Demo Personas */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>내 돈 파악</span>
              <span aria-hidden="true">·</span>
              <span>투자 가능 금액</span>
              <span aria-hidden="true">·</span>
              <span>성향·투자자 스타일</span>
              <span aria-hidden="true">·</span>
              <span>10,000회 시간 여행</span>
            </div>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              생활에 필요한 자금을 먼저 지키고, 남는 돈으로 미래를 실험하세요.
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              월 소득·지출·부채·비상자금·잠긴 보증금을 입력하면 실제로 투자해도 되는 금액을 먼저 분리합니다. 직접 입력하거나 아래 청년 예시를 불러와 바로 시작할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {DEMO_PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onApplyPreset(p.id)}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-left transition-colors hover:border-[#1D4ED8] hover:bg-blue-50/50"
            >
              <div className="text-sm font-semibold text-slate-900">{p.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{p.subtitle}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Natural Language Quick Input Helper (AI / Rule-based clearly labeled) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-900">
              자연어로 간편 입력 후보 추출
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {aiAvailable
              ? '서버 Gemini AI 연동 가능 (확인 후 반영)'
              : '오프라인 규칙 기반 추출 (API 키 없이 작동)'}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            placeholder="예: 28살이고 월급 320만원, 월세 60만원, 생활비 90만원, 모은 돈 1800만원 중 전세보증금 1000만원 빼고 싶어요"
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4ED8] focus:outline-2 focus:outline-[#1D4ED8]/20"
          />
          <button
            type="button"
            disabled={extracting}
            onClick={handleExtractFromText}
            className="min-h-[44px] shrink-0 whitespace-nowrap rounded-lg border border-[#1D4ED8] bg-white px-4 py-2 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-blue-50 disabled:opacity-50"
          >
            {extracting ? '추출 중...' : '문장에서 후보 추출'}
          </button>
        </div>

        {candidate && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-slate-900">
                추출된 입력 후보 ({candidate.sourceMode === 'gemini_ai' ? 'Gemini AI 추출' : '규칙 기반 추출'})
              </strong>
              <button
                type="button"
                onClick={applyCandidate}
                className="rounded-md bg-[#1D4ED8] px-3 py-1.5 font-semibold text-white hover:bg-blue-800"
              >
                확인 후 입력란에 반영
              </button>
            </div>
            {candidate.notes.length > 0 && (
              <ul className="mt-2 space-y-1 text-slate-700">
                {candidate.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            )}
            {candidate.missingQuestions.length > 0 && (
              <div className="mt-2 border-t border-blue-200 pt-2 text-slate-600">
                <span className="font-semibold">추가 확인 필요: </span>
                {candidate.missingQuestions.join(' / ')}
              </div>
            )}
          </div>
        )}
      </section>

      {validationErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800"
        >
          {validationErrors.map((err, i) => (
            <p key={i}>• {err}</p>
          ))}
        </div>
      )}

      {/* Main Structured Input Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1: 나이·기간·목표·가정 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">1. 나이 · 목표 · 물가 가정</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="current-age" className="mb-1 block text-xs font-semibold text-slate-700">
                현재 나이
              </label>
              <input
                id="current-age"
                type="number"
                min={15}
                max={80}
                value={cashflow.currentAge}
                onChange={(e) => updateField('currentAge', Number(e.target.value) || 20)}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="retire-age" className="mb-1 block text-xs font-semibold text-slate-700">
                은퇴 예정 나이 (투자 {horizonYears}년)
              </label>
              <input
                id="retire-age"
                type="number"
                min={cashflow.currentAge + 1}
                max={95}
                value={cashflow.retireAge}
                onChange={(e) => updateField('retireAge', Number(e.target.value) || cashflow.currentAge + 10)}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <MoneyField
            id="target-amount"
            label="은퇴/장기 목표 자산 금액"
            value={cashflow.targetAmount}
            onChange={(n) => updateField('targetAmount', n)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="emergency-months" className="mb-1 block text-xs font-semibold text-slate-700">
                비상자금 목표 (개월)
              </label>
              <input
                id="emergency-months"
                type="number"
                min={0}
                max={24}
                value={cashflow.emergencyTargetMonths}
                onChange={(e) => updateField('emergencyTargetMonths', Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="inflation-rate" className="mb-1 block text-xs font-semibold text-slate-700">
                연 물가상승률 (%)
              </label>
              <input
                id="inflation-rate"
                type="number"
                step={0.1}
                min={0}
                max={15}
                value={Number((cashflow.annualInflationRate * 100).toFixed(1))}
                onChange={(e) => updateField('annualInflationRate', (Number(e.target.value) || 0) / 100)}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="income-growth" className="mb-1 block text-xs font-semibold text-slate-700">
                연 적립액 증가율 (%)
              </label>
              <input
                id="income-growth"
                type="number"
                step={0.5}
                min={-10}
                max={20}
                value={Number((cashflow.annualIncomeGrowthRate * 100).toFixed(1))}
                onChange={(e) => updateField('annualIncomeGrowthRate', (Number(e.target.value) || 0) / 100)}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>
        </section>

        {/* Card 2: 소득·안정성·지출 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">2. 소득 · 안정성 · 지출</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoneyField
              id="monthly-income"
              label="세후 월소득"
              value={cashflow.monthlyNetIncome}
              onChange={(n) => updateField('monthlyNetIncome', n)}
            />
            <div>
              <label htmlFor="income-stability" className="mb-1 block text-xs font-semibold text-slate-700">
                소득 안정성
              </label>
              <select
                id="income-stability"
                value={cashflow.incomeStability}
                onChange={(e) => updateField('incomeStability', e.target.value as IncomeStability)}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="high">높음 (정규직·고정 급여)</option>
                <option value="medium">보통 (성과급·수습·계약)</option>
                <option value="low">낮음 (프리랜서·변동 소득)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MoneyField
              id="exp-housing"
              label="주거비 (월세·관리)"
              value={cashflow.housingExpense}
              onChange={(n) => updateField('housingExpense', n)}
            />
            <MoneyField
              id="exp-food"
              label="식비"
              value={cashflow.foodExpense}
              onChange={(n) => updateField('foodExpense', n)}
            />
            <MoneyField
              id="exp-transport"
              label="교통·통신비"
              value={cashflow.transportExpense}
              onChange={(n) => updateField('transportExpense', n)}
            />
            <MoneyField
              id="exp-insurance"
              label="보험·의료"
              value={cashflow.insuranceExpense}
              onChange={(n) => updateField('insuranceExpense', n)}
            />
            <MoneyField
              id="exp-other"
              label="기타 필수지출"
              value={cashflow.otherEssentialExpense}
              onChange={(n) => updateField('otherEssentialExpense', n)}
            />
            <MoneyField
              id="exp-disc"
              label="선택 지출 (여가)"
              value={cashflow.discretionaryExpense}
              onChange={(n) => updateField('discretionaryExpense', n)}
            />
          </div>

          <MoneyField
            id="exp-irregular"
            label="연간·비정기 지출 합계 (명절·세금·여행·경조사 등)"
            value={cashflow.annualIrregularExpense}
            onChange={(n) => updateField('annualIrregularExpense', n)}
            hint={`매달 ${fmtKRW(cashflow.annualIrregularExpense / 12)}씩 적립 필요액으로 자동 반영됩니다.`}
          />
        </section>

        {/* Card 3: 부채 목록 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">3. 부채 현황 (중복 차감 방지)</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                이미 월 주거비·필수지출에 상환액을 넣었다면 체크박스를 켜 중복 차감을 막으세요.
              </p>
            </div>
            <button
              type="button"
              onClick={addDebt}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>부채 추가</span>
            </button>
          </div>

          {cashflow.debts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              등록된 부채가 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {cashflow.debts.map((debt, idx) => (
                <div
                  key={debt.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={debt.name}
                      onChange={(e) => updateDebt(idx, { name: e.target.value })}
                      className="min-h-[36px] flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => removeDebt(idx)}
                      aria-label={`${debt.name} 삭제`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-500">잔액 (원)</label>
                      <input
                        type="number"
                        min={0}
                        step={100_000}
                        value={debt.balance}
                        onChange={(e) => updateDebt(idx, { balance: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full min-h-[36px] rounded-md border border-slate-300 bg-white px-2 font-mono text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-500">연 금리 (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={0.1}
                        value={Number((debt.annualRate * 100).toFixed(2))}
                        onChange={(e) => updateDebt(idx, { annualRate: Math.max(0, (Number(e.target.value) || 0) / 100) })}
                        className="w-full min-h-[36px] rounded-md border border-slate-300 bg-white px-2 font-mono text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-500">월 상환액 (원)</label>
                      <input
                        type="number"
                        min={0}
                        step={10_000}
                        value={debt.monthlyPayment}
                        onChange={(e) => updateDebt(idx, { monthlyPayment: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full min-h-[36px] rounded-md border border-slate-300 bg-white px-2 font-mono text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={debt.includedInEssentialExpense}
                      onChange={(e) => updateDebt(idx, { includedInEssentialExpense: e.target.checked })}
                      className="h-4 w-4 accent-[#1D4ED8]"
                    />
                    <span>이미 위 필수 지출(주거비 등)에 포함된 상환액/이자임 (중복 차감 안 함)</span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Card 4: 자산·단기 목표·적립 및 인출 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">4. 보유 자산 · 단기 자금 · 적립/인출</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MoneyField
              id="asset-cash"
              label="현금 · 예금 (즉시 인출 가능)"
              value={cashflow.cashAndDeposits}
              onChange={(n) => updateField('cashAndDeposits', n)}
            />
            <MoneyField
              id="asset-invested"
              label="기존 투자자산 (주식·ETF 등)"
              value={cashflow.existingInvestments}
              onChange={(n) => updateField('existingInvestments', n)}
            />
            <MoneyField
              id="asset-locked"
              label="사용 불가 자산 (전세보증금·주택)"
              value={cashflow.lockedAssets}
              onChange={(n) => updateField('lockedAssets', n)}
              hint="투자 가능 현금 계산에서는 제외되고 총 순자산에만 반영됩니다."
            />
            <MoneyField
              id="asset-nearterm"
              label="가까운 시일 내 사용할 자금 (학비·이사)"
              value={cashflow.nearTermGoalCash}
              onChange={(n) => updateField('nearTermGoalCash', n)}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="surplus-ratio" className="text-xs font-semibold text-slate-700">
                월 잉여자금 중 투자에 배분할 비율
              </label>
              <span className="font-mono text-xs font-bold text-[#1D4ED8] tabular-nums">
                {Math.round(cashflow.surplusInvestRatio * 100)}%
              </span>
            </div>
            <input
              id="surplus-ratio"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(cashflow.surplusInvestRatio * 100)}
              onChange={(e) => updateField('surplusInvestRatio', Number(e.target.value) / 100)}
              className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
            />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  초기 투자액 직접 지정 (비워두면 자동)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100_000}
                  placeholder="자동 권고액 사용"
                  value={cashflow.initialInvestOverride ?? ''}
                  onChange={(e) =>
                    updateField(
                      'initialInvestOverride',
                      e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  월 적립액 직접 지정 (비워두면 자동)
                </label>
                <input
                  type="number"
                  min={0}
                  step={50_000}
                  placeholder="자동 권고액 사용"
                  value={cashflow.monthlyInvestOverride ?? ''}
                  onChange={(e) =>
                    updateField(
                      'monthlyInvestOverride',
                      e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* 납입 중단 가정 & 예정 인출 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                실직/휴직 납입 중단 시작 (개월 후, 선택)
              </label>
              <input
                type="number"
                min={1}
                placeholder="없음"
                value={cashflow.contributionPauseStartMonth ?? ''}
                onChange={(e) =>
                  updateField(
                    'contributionPauseStartMonth',
                    e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1)
                  )
                }
                className="w-full min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                납입 중단 기간 (개월 수)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={cashflow.contributionPauseMonths}
                onChange={(e) =>
                  updateField('contributionPauseMonths', Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs tabular-nums"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">예정된 일시 인출 (결혼·주택 등)</span>
              <button
                type="button"
                onClick={addWithdrawal}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                <span>인출 추가</span>
              </button>
            </div>
            {cashflow.plannedWithdrawals.map((w, idx) => (
              <div key={w.id} className="mt-2 grid grid-cols-12 items-center gap-2">
                <input
                  type="text"
                  value={w.label}
                  onChange={(e) => updateWithdrawal(idx, { label: e.target.value })}
                  className="col-span-5 min-h-[36px] rounded-md border border-slate-300 px-2 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  value={w.monthIndex}
                  onChange={(e) => updateWithdrawal(idx, { monthIndex: Math.max(1, Number(e.target.value) || 1) })}
                  className="col-span-2 min-h-[36px] rounded-md border border-slate-300 px-2 font-mono text-xs tabular-nums"
                  title="경과 개월 수"
                />
                <input
                  type="number"
                  min={0}
                  step={1_000_000}
                  value={w.amount}
                  onChange={(e) => updateWithdrawal(idx, { amount: Math.max(0, Number(e.target.value) || 0) })}
                  className="col-span-4 min-h-[36px] rounded-md border border-slate-300 px-2 font-mono text-xs tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => removeWithdrawal(idx)}
                  aria-label="인출 삭제"
                  className="col-span-1 flex h-9 items-center justify-center text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onGoNext}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
        >
          <span>2. 내 돈 분석 대시보드 확인하기</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
