import { useMemo, useState } from 'react';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { ASSET_CLASS_ORDER, DEFAULT_ASSET_SPECS, INVESTOR_STYLES } from '../data/instruments';
import { CsvParseReport, parseHistoricalCsv, runSequentialWalkForwardBacktest } from '../engine/backtest';
import {
  AssetClassId,
  AssetClassSpec,
  DataMode,
  HistoricalMonthlyRow,
  InvestorStyleId,
  RiskProfileId,
} from '../types/wealth';
import { fmtKRW, fmtPct } from '../utils/formatters';

interface DataAndMethodologyViewProps {
  dataMode: DataMode;
  assetSpecs: Record<AssetClassId, AssetClassSpec>;
  historicalRows: HistoricalMonthlyRow[];
  styleId: InvestorStyleId;
  profileId: RiskProfileId;
  onChangeDataMode: (mode: DataMode) => void;
  onChangeAssetSpecs: (specs: Record<AssetClassId, AssetClassSpec>) => void;
  onImportCustomRows: (rows: HistoricalMonthlyRow[]) => void;
  onExportJson: () => void;
  onClearAllData: () => void;
  persistLocal: boolean;
  onTogglePersistLocal: (persist: boolean) => void;
}

export function DataAndMethodologyView({
  dataMode,
  assetSpecs,
  historicalRows,
  styleId,
  profileId,
  onChangeDataMode,
  onChangeAssetSpecs,
  onImportCustomRows,
  onExportJson,
  onClearAllData,
  persistLocal,
  onTogglePersistLocal,
}: DataAndMethodologyViewProps) {
  const [csvInput, setCsvInput] = useState(
    'date,cash,bond,equity_index,gold,quality_stock\n2023-01,0.28,1.1,5.2,3.4,6.1\n2023-02,0.25,-1.4,-2.3,-1.8,-2.9\n2023-03,0.29,1.8,3.1,4.2,3.8'
  );
  const [csvReport, setCsvReport] = useState<CsvParseReport | null>(null);

  const backtestResults = useMemo(
    () => runSequentialWalkForwardBacktest(historicalRows, styleId, profileId, 36),
    [historicalRows, styleId, profileId]
  );

  const handleParseCsv = () => {
    const report = parseHistoricalCsv(csvInput, 'auto');
    setCsvReport(report);
    if (report.errors.length === 0 && report.rows.length > 0) {
      onImportCustomRows(report.rows);
      onChangeDataMode('user_custom');
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Mode & Parameter Editor */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              데이터 모드 · 자산별 가정 및 출처 검증
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              개발용 가정값·과거 샘플 자료·사용자 CSV를 명확히 구분하며, 실제 시장 통계나 실시간 호가로 가장하지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['dev_assumption', '개발용 가정'],
                ['historical_sample', '과거 샘플 자료'],
                ['user_custom', '사용자 설정/CSV'],
              ] as Array<[DataMode, string]>
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeDataMode(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  dataMode === m ? 'bg-white text-[#1D4ED8] shadow-xs' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">자산군</th>
                <th className="py-2 px-2 font-medium">연 기대수익률 (%)</th>
                <th className="py-2 px-2 font-medium">연 변동성 (%)</th>
                <th className="py-2 px-2 font-medium">연 보수 (%)</th>
                <th className="py-2 px-2 font-medium">통화 / 환노출</th>
                <th className="py-2 pl-2 font-medium">출처 · 기준일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ASSET_CLASS_ORDER.map((id) => {
                const s = assetSpecs[id];
                return (
                  <tr key={id}>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{s.label}</td>
                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        step={0.5}
                        min={-50}
                        max={30}
                        value={Number((s.annualSimpleReturn * 100).toFixed(1))}
                        onChange={(e) => {
                          onChangeDataMode('user_custom');
                          onChangeAssetSpecs({
                            ...assetSpecs,
                            [id]: { ...s, annualSimpleReturn: (Number(e.target.value) || 0) / 100 },
                          });
                        }}
                        className="w-20 rounded border border-slate-300 px-2 py-1 font-mono text-xs tabular-nums"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        max={60}
                        value={Number((s.annualLogVolatility * 100).toFixed(1))}
                        onChange={(e) => {
                          onChangeDataMode('user_custom');
                          onChangeAssetSpecs({
                            ...assetSpecs,
                            [id]: { ...s, annualLogVolatility: Math.max(0, Number(e.target.value) || 0) / 100 },
                          });
                        }}
                        className="w-20 rounded border border-slate-300 px-2 py-1 font-mono text-xs tabular-nums"
                      />
                    </td>
                    <td className="py-2.5 px-2 font-mono tabular-nums">
                      {(s.annualFee * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-slate-600">
                      {s.currency} · {s.fxExposed ? '원화 환산 (1+r)(1+f)-1' : '원화 직접'}
                    </td>
                    <td className="py-2.5 pl-2 text-slate-500">
                      {s.sourceName} ({s.asOfDate})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onChangeAssetSpecs(DEFAULT_ASSET_SPECS);
              onChangeDataMode('dev_assumption');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>개발용 기본 가정 복원</span>
          </button>
        </div>
      </section>

      {/* CSV Importer & Validation */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">
            월간 총수익률 CSV 가져오기 및 데이터 검증
          </h2>
        </div>
        <p className="text-xs text-slate-600">
          필수 컬럼: <code className="font-mono">date,cash,bond,equity_index,gold,quality_stock</code> (중복 날짜, 결측치, 수익률 단위(% vs 소수), 공통 관측 기간을 자동 검사합니다.)
        </p>
        <textarea
          rows={4}
          value={csvInput}
          onChange={(e) => setCsvInput(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-slate-800"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleParseCsv}
            className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            CSV 검증 및 적용
          </button>
          {csvReport && (
            <span className="text-xs text-slate-600">
              파싱 결과: {csvReport.rows.length}개월 ({csvReport.dateRange}) · 단위:{' '}
              {csvReport.detectedUnit === 'percent' ? '%' : '소수'}
            </span>
          )}
        </div>
        {csvReport && csvReport.errors.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {csvReport.errors.map((e, i) => (
              <p key={i}>• {e}</p>
            ))}
          </div>
        )}
        {csvReport && csvReport.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {csvReport.warnings.map((w, i) => (
              <p key={i}>• {w}</p>
            ))}
          </div>
        )}
      </section>

      {/* Out-of-Sample Walk-Forward Backtest */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-bold text-slate-900">
          과거 구간 순차 검증 (Out-of-Sample Walk-Forward, 미래 시뮬레이션과 구분)
        </h2>
        <p className="text-xs text-slate-500">
          최소 36개월 학습/관측 이후의 연속 구간에서만 순차 검증합니다. 미래 데이터를 파라미터 산정이나 신호 계산에 섞지 않습니다.
        </p>

        {backtestResults.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">
            순차 검증을 수행하려면 최소 42개월 이상의 시계열 자료가 필요합니다. (과거 샘플 자료 180개월 선택 시 확인 가능)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">검증 구간</th>
                  <th className="py-2 px-3 font-medium">기간</th>
                  <th className="py-2 px-3 font-medium">스타일</th>
                  <th className="py-2 px-3 text-right font-medium">구간 총수익률</th>
                  <th className="py-2 px-3 text-right font-medium">연환산 수익률</th>
                  <th className="py-2 px-3 text-right font-medium">최대낙폭</th>
                  <th className="py-2 pl-3 text-right font-medium">1,000만 원 기준 결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {backtestResults.map((bt) => (
                  <tr key={bt.windowLabel}>
                    <td className="py-2 pr-3 font-sans font-semibold text-slate-800">{bt.windowLabel}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {bt.startDate} ~ {bt.endDate} ({bt.months}m)
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-700">{INVESTOR_STYLES[bt.styleId].name}</td>
                    <td className="py-2 px-3 text-right">{fmtPct(bt.totalReturn, 1, true)}</td>
                    <td className="py-2 px-3 text-right">{fmtPct(bt.annualizedReturn, 1, true)}</td>
                    <td className="py-2 px-3 text-right text-rose-700">-{fmtPct(bt.maxDrawdown, 1)}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-slate-900">
                      {fmtKRW(bt.endingValueOn10M)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Data Export / Clear Local Storage & Regulatory Disclaimers */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">개인 재무정보 관리 및 법적 고지</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              입력한 금액과 부채는 서버 로그나 분석 로그에 저장하지 않으며, 브라우저 메모리(및 선택적 로컬 저장)에서만 관리됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>설정 JSON 내보내기</span>
            </button>
            <button
              type="button"
              onClick={onClearAllData}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>저장 데이터 초기화 · 삭제</span>
            </button>
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={persistLocal}
            onChange={(e) => onTogglePersistLocal(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-[#1D4ED8]"
          />
          <span>이 브라우저(localStorage)에 내 입력값 선택 저장</span>
        </label>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 space-y-1.5">
          <p>
            • <strong>교육·모의실험 목적 고지:</strong> 본 서비스의 모든 수치는 모형 가정에 따른 확률적 계산 결과이며 실제 투자 수익이나 손실 상한을 보장하지 않습니다.
          </p>
          <p>
            • <strong>세금 및 규제 참고:</strong> 모든 시뮬레이션 결과는 보수·리밸런싱 비용을 반영한 <strong>세전 기준</strong>입니다. 향후 실제 서비스 상용화 시 개인별 상품 추천 및 투자자문·유사투자자문 요건은 금융위원회 등 최신 국내 법령과 실제 제공 방식에 맞춰 별도 검토가 필요합니다.
          </p>
        </div>
      </section>
    </div>
  );
}
