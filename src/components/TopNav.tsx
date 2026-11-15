import { Check, Share2 } from 'lucide-react';

export type AppStepId = 'quick' | 'input' | 'dashboard' | 'portfolio' | 'timetravel' | 'data';

export const APP_STEPS: Array<{ id: AppStepId; label: string }> = [
  { id: 'quick', label: '주사위 · 1만회' },
  { id: 'input', label: '1. 내 돈 입력' },
  { id: 'dashboard', label: '2. 분석 대시보드' },
  { id: 'portfolio', label: '3. 포트폴리오' },
  { id: 'timetravel', label: '4. 시간 여행' },
  { id: 'data', label: '5. 근거 · 검증' },
];

interface TopNavProps {
  activeStep: AppStepId;
  copiedShareUrl: boolean;
  onSelectStep: (step: AppStepId) => void;
  onCopyShareLink: () => void;
}

export function TopNav({
  activeStep,
  copiedShareUrl,
  onSelectStep,
  onCopyShareLink,
}: TopNavProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single wordmark */}
        <button
          type="button"
          onClick={() => onSelectStep('input')}
          className="shrink-0 whitespace-nowrap text-lg font-bold tracking-tight text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
        >
          내일의 자산
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="단계별 이동"
          className="hidden lg:flex items-center gap-5 text-sm font-medium"
        >
          {APP_STEPS.map((step) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`shrink-0 whitespace-nowrap border-b-2 py-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                  active
                    ? 'border-[#1D4ED8] font-semibold text-[#1D4ED8]'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {step.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary utility action (설정 링크 복사) */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onCopyShareLink}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#1D4ED8] hover:text-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            {copiedShareUrl ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span>링크 복사됨</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>설정 링크 복사</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile & tablet compact horizontal step bar */}
      <div className="border-t border-slate-100 bg-slate-50/80 lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-4 py-2">
          {APP_STEPS.map((step) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#1D4ED8] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                }`}
              >
                {step.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
