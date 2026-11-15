import { AssetClassId, HistoricalMonthlyRow } from '../types/wealth';

/**
 * 180개월(2010-01 ~ 2024-12) 교육·검증용 샘플 월간 총수익률 벡터(원화 환산 기준).
 * 실제 시장 관측치와 구분되는 합성/교육용 샘플 데이터셋임을 UI와 문서에 명시합니다.
 * 각 월의 5개 자산군이 동일한 시장 레짐(확장/금리상승/하락충격/회복)을 공유하도록 생성되어
 * 블록 부트스트랩 및 순차적 Out-of-Sample 백테스트 검증에 사용됩니다.
 */
function generateRepresentativeSampleHistory(): HistoricalMonthlyRow[] {
  const rows: HistoricalMonthlyRow[] = [];
  let state = 20261115;
  const rand = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randn = () => {
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  for (let idx = 0; idx < 180; idx++) {
    const year = 2010 + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const date = `${year}-${String(month).padStart(2, '0')}`;

    // Simulate realistic macro cycles (2011 dip, 2018 slowdown, 2020 shock/rebound, 2022 rate-hike drawdown)
    const isShock2020 = year === 2020 && (month === 2 || month === 3);
    const isRebound2020 = year === 2020 && month >= 4 && month <= 8;
    const isRateHike2022 = year === 2022 && month <= 9;

    const macroFactor = randn();
    const rateFactor = randn();
    const goldFactor = randn();
    const idioFactor = randn();

    let cash = 0.0023 + 0.0008 * rateFactor;
    let bond = 0.0034 - 0.015 * rateFactor + 0.003 * macroFactor;
    let equity = 0.0065 + 0.041 * macroFactor + 0.005 * rateFactor;
    let gold = 0.0038 + 0.038 * goldFactor - 0.008 * rateFactor + 0.004 * macroFactor;
    let quality = 0.0078 + 0.048 * macroFactor + 0.036 * idioFactor;

    if (isShock2020) {
      equity -= 0.09;
      quality -= 0.10;
      bond += 0.015;
      gold += 0.01;
    } else if (isRebound2020) {
      equity += 0.04;
      quality += 0.045;
      gold += 0.02;
    } else if (isRateHike2022) {
      bond -= 0.016;
      equity -= 0.022;
      quality -= 0.028;
      cash += 0.0012;
    }

    const clampReturn = (v: number) => Math.max(-0.45, Math.min(0.45, Number(v.toFixed(5))));
    const returns: Record<AssetClassId, number> = {
      cash: clampReturn(cash),
      bond: clampReturn(bond),
      equity_index: clampReturn(equity),
      gold: clampReturn(gold),
      quality_stock: clampReturn(quality),
    };

    rows.push({ date, returns });
  }
  return rows;
}

export const SAMPLE_HISTORICAL_ROWS: HistoricalMonthlyRow[] =
  generateRepresentativeSampleHistory();
