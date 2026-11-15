import { ASSET_CLASS_ORDER } from '../data/instruments';
import {
  AssetClassId,
  BacktestWindowResult,
  HistoricalMonthlyRow,
  InvestorStyleId,
  RiskProfileId,
} from '../types/wealth';
import { computeStyleWeights } from './portfolio';

export interface CsvParseReport {
  rows: HistoricalMonthlyRow[];
  errors: string[];
  warnings: string[];
  dateRange: string;
  detectedUnit: 'percent' | 'decimal';
}

/**
 * Parses user-uploaded CSV of monthly asset returns:
 * Expected columns: date,cash,bond,equity_index,gold,quality_stock
 * Checks date format, duplicates, missing values, NaN, and return unit.
 */
export function parseHistoricalCsv(
  csvText: string,
  unitOverride: 'auto' | 'percent' | 'decimal' = 'auto'
): CsvParseReport {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['헤더를 포함해 최소 2줄 이상의 CSV 데이터가 필요합니다.'],
      warnings: [],
      dateRange: '-',
      detectedUnit: 'decimal',
    };
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const dateIdx = headers.indexOf('date');
  const colIdx: Record<AssetClassId, number> = {
    cash: headers.indexOf('cash'),
    bond: headers.indexOf('bond'),
    equity_index: headers.indexOf('equity_index'),
    gold: headers.indexOf('gold'),
    quality_stock: headers.indexOf('quality_stock'),
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (dateIdx === -1) {
    errors.push('date 컬럼이 없습니다. (예: date,cash,bond,equity_index,gold,quality_stock)');
  }
  for (const id of ASSET_CLASS_ORDER) {
    if (colIdx[id] === -1) {
      errors.push(`${id} 컬럼이 누락되었습니다.`);
    }
  }
  if (errors.length > 0) {
    return { rows: [], errors, warnings, dateRange: '-', detectedUnit: 'decimal' };
  }

  const rawRows: Array<{ date: string; values: Record<AssetClassId, number> }> = [];
  const seenDates = new Set<string>();
  let maxAbsVal = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const dateVal = cells[dateIdx] ?? '';
    if (!/^\d{4}-\d{2}/.test(dateVal)) {
      errors.push(`${i + 1}행 날짜 형식 오류(${dateVal}): YYYY-MM 형식이어야 합니다.`);
      continue;
    }
    const normDate = dateVal.slice(0, 7);
    if (seenDates.has(normDate)) {
      errors.push(`${i + 1}행 중복 날짜(${normDate})가 발견되었습니다.`);
      continue;
    }
    seenDates.add(normDate);

    let rowHasError = false;
    const values = {} as Record<AssetClassId, number>;
    for (const id of ASSET_CLASS_ORDER) {
      const cell = cells[colIdx[id]];
      if (cell === undefined || cell === '') {
        errors.push(`${i + 1}행 ${id} 결측치가 있습니다.`);
        rowHasError = true;
        break;
      }
      const cleaned = cell.replace(/%$/, '');
      const num = Number(cleaned);
      if (!Number.isFinite(num)) {
        errors.push(`${i + 1}행 ${id} 숫자 형식 오류(${cell}).`);
        rowHasError = true;
        break;
      }
      if (Math.abs(num) > maxAbsVal) maxAbsVal = Math.abs(num);
      values[id] = cell.endsWith('%') ? num / 100 : num;
    }

    if (!rowHasError) {
      rawRows.push({ date: normDate, values });
    }
  }

  const detectedUnit: 'percent' | 'decimal' =
    unitOverride === 'auto' ? (maxAbsVal > 1.2 ? 'percent' : 'decimal') : unitOverride;

  const rows: HistoricalMonthlyRow[] = rawRows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const returns = {} as Record<AssetClassId, number>;
      for (const id of ASSET_CLASS_ORDER) {
        returns[id] = detectedUnit === 'percent' ? r.values[id] / 100 : r.values[id];
      }
      return { date: r.date, returns };
    });

  if (rows.length > 0 && rows.length < 36) {
    warnings.push(
      `공통 관측 기간이 ${rows.length}개월로 짧습니다. 10년·은퇴 같은 장기 전망 검증에는 자료가 부족하므로 해석에 주의하세요.`
    );
  }

  return {
    rows,
    errors,
    warnings,
    dateRange: rows.length > 0 ? `${rows[0].date} ~ ${rows[rows.length - 1].date}` : '-',
    detectedUnit,
  };
}

/**
 * Sequential walk-forward out-of-sample evaluation on historical monthly rows.
 * Never peeks into future rows when computing t-1 tactical signal.
 */
export function runSequentialWalkForwardBacktest(
  rows: HistoricalMonthlyRow[],
  styleId: InvestorStyleId,
  profileId: RiskProfileId,
  trainMonths: number = 36
): BacktestWindowResult[] {
  if (rows.length <= trainMonths + 6) return [];

  const { constrained: baseWeights } = computeStyleWeights(profileId, styleId);
  const windowSize = 36; // 3-year rolling out-of-sample windows
  const results: BacktestWindowResult[] = [];

  for (let start = trainMonths; start + 12 <= rows.length; start += windowSize) {
    const end = Math.min(rows.length, start + windowSize);
    const slice = rows.slice(start, end);

    let nav = 1.0;
    let peak = 1.0;
    let maxDd = 0;

    // Lagged 6m equity index cumulative return using strictly prior rows
    const equityHistory: number[] = [1.0];
    for (let k = Math.max(0, start - 6); k < start; k++) {
      equityHistory.push(equityHistory[equityHistory.length - 1] * (1 + rows[k].returns.equity_index));
    }

    for (let i = 0; i < slice.length; i++) {
      const w = { ...baseWeights };
      if (styleId === 'druckenmiller' && equityHistory.length >= 7) {
        const prev = equityHistory[equityHistory.length - 1];
        const ago6 = equityHistory[equityHistory.length - 7];
        const sig = ago6 > 0 ? prev / ago6 - 1 : 0;
        if (sig < -0.04) {
          const shift = Math.min(w.equity_index * 0.35, 0.12);
          w.equity_index -= shift;
          w.cash += shift * 0.5;
          w.bond += shift * 0.5;
        }
      }

      const row = slice[i];
      let portRet = 0;
      for (const id of ASSET_CLASS_ORDER) {
        portRet += w[id] * row.returns[id];
      }
      // Small transaction/fee drag
      nav = nav * (1 + portRet - 0.0002);
      if (nav > peak) peak = nav;
      const dd = (peak - nav) / peak;
      if (dd > maxDd) maxDd = dd;

      equityHistory.push(equityHistory[equityHistory.length - 1] * (1 + row.returns.equity_index));
    }

    const years = slice.length / 12;
    const totalReturn = nav - 1;
    const annualizedReturn = Math.pow(Math.max(1e-6, nav), 1 / years) - 1;

    results.push({
      windowLabel: `검증 구간 ${results.length + 1}`,
      startDate: slice[0].date,
      endDate: slice[slice.length - 1].date,
      months: slice.length,
      styleId,
      totalReturn,
      annualizedReturn,
      maxDrawdown: maxDd,
      endingValueOn10M: Math.round(10_000_000 * nav),
    });
  }

  return results;
}
