import { describe, expect, it } from 'vitest';
import {
  buildQuickShareUrl,
  getQuickPercentileRank,
  parseQuickParamsFromSearch,
  QUICK_HORIZON_OPTIONS,
  QUICK_RISK_PROFILES,
  runQuickMonteCarlo,
  runQuickSingleSimulation,
} from '../gbmQuickSim';

describe('간편 주사위(1회) & 10,000회 GBM 시뮬레이터 검증', () => {
  it('성향별 기본값(4%/6%, 7%/13%, 10.5%/22%)과 4가지 기간 스텝(21, 26, 52, 120)을 정확히 적용한다', () => {
    expect(QUICK_RISK_PROFILES.conservative.defaultAnnualReturn).toBe(0.04);
    expect(QUICK_RISK_PROFILES.conservative.defaultAnnualVolatility).toBe(0.06);
    expect(QUICK_RISK_PROFILES.moderate.defaultAnnualReturn).toBe(0.07);
    expect(QUICK_RISK_PROFILES.moderate.defaultAnnualVolatility).toBe(0.13);
    expect(QUICK_RISK_PROFILES.aggressive.defaultAnnualReturn).toBe(0.105);
    expect(QUICK_RISK_PROFILES.aggressive.defaultAnnualVolatility).toBe(0.22);

    expect(QUICK_HORIZON_OPTIONS['1m'].steps).toBe(21);
    expect(QUICK_HORIZON_OPTIONS['6m'].steps).toBe(26);
    expect(QUICK_HORIZON_OPTIONS['1y'].steps).toBe(52);
    expect(QUICK_HORIZON_OPTIONS['10y'].steps).toBe(120);
  });

  it('1회 실행은 매번 무작위 경로를 생성하고, 10,000회 실행은 일관된 통계·백분위 순서를 반환한다', () => {
    const params = {
      principal: 1_000_000,
      profileId: 'moderate' as const,
      horizonId: '1y' as const,
      annualReturn: 0.07,
      annualVolatility: 0.13,
    };

    const s1 = runQuickSingleSimulation(params, 1);
    const s2 = runQuickSingleSimulation(params, 2);
    expect(s1.points.length).toBe(53);
    expect(s1.finalValue).not.toBe(s2.finalValue);

    const mc = runQuickMonteCarlo(params, 10_000);
    expect(mc.runCount).toBe(10_000);
    expect(mc.sortedFinals.length).toBe(10_000);
    expect(mc.bottom5Final).toBeLessThanOrEqual(mc.medianFinal);
    expect(mc.medianFinal).toBeLessThanOrEqual(mc.top5Final);
    expect(mc.lossProbability + mc.profitProbability).toBeCloseTo(1, 3);

    const rank = getQuickPercentileRank(mc.sortedFinals, mc.medianFinal);
    expect(rank).toBeGreaterThan(45);
    expect(rank).toBeLessThan(55);
  });

  it('설정 링크 URL 파라미터 직렬화 및 복원이 정확히 동작한다', () => {
    const params = {
      principal: 5_000_000,
      profileId: 'aggressive' as const,
      horizonId: '10y' as const,
      annualReturn: 0.11,
      annualVolatility: 0.24,
    };
    const urlStr = buildQuickShareUrl('https://example.com/', params);
    const parsed = parseQuickParamsFromSearch(new URL(urlStr).search);
    expect(parsed.hasQuickQuery).toBe(true);
    expect(parsed.params).toEqual(params);
  });
});
