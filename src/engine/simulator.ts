import {
  ASSET_CLASS_ORDER,
  DATA_VERSION,
  DEFAULT_CORRELATION_MATRIX,
  MODEL_VERSION,
} from '../data/instruments';
import {
  AssetClassId,
  AssetClassSpec,
  CashflowAnalysis,
  CashflowInput,
  DataMode,
  FanSeriesPoint,
  HistoricalMonthlyRow,
  MilestoneStats,
  PortfolioRecommendation,
  SimulationMode,
  SimulationOutput,
  SinglePathPoint,
} from '../types/wealth';

/**
 * Deterministic Mulberry32 PRNG for reproducible seed-based simulations.
 */
export function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Validates symmetry & performs Cholesky decomposition with explicit jitter correction if singular.
 */
export function choleskyWithValidation(corr: number[][]): {
  L: number[][];
  wasAdjusted: boolean;
  jitterAdded: number;
} {
  const n = corr.length;
  // Symmetrize first
  const sym: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => 0.5 * (corr[i][j] + corr[j][i]))
  );

  let jitter = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    let failed = false;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        if (i === j) {
          const val = sym[i][i] + jitter - sum;
          if (val <= 1e-10) {
            failed = true;
            break;
          }
          L[i][j] = Math.sqrt(val);
        } else {
          L[i][j] = (sym[i][j] - sum) / L[j][j];
        }
      }
      if (failed) break;
    }

    if (!failed) {
      return { L, wasAdjusted: attempt > 0, jitterAdded: jitter };
    }
    jitter = attempt === 0 ? 1e-4 : jitter * 10;
  }

  // Fallback identity matrix if severely non-PSD
  const identity = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  return { L: identity, wasAdjusted: true, jitterAdded: 1 };
}

function getPercentileSorted(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export interface RunSimulationOptions {
  cashflow: CashflowInput;
  analysis: CashflowAnalysis;
  portfolio: PortfolioRecommendation;
  assetSpecs: Record<AssetClassId, AssetClassSpec>;
  correlationMatrix?: number[][];
  mode: SimulationMode;
  dataMode: DataMode;
  historicalRows?: HistoricalMonthlyRow[];
  bootstrapBlockLength?: number;
  runCount?: number;
  seed?: number;
  stressScenario?: boolean;
  constantComparisonRate?: number;
  selectedPathIndex?: number;
  lossBudgetRatio?: number;
  onProgress?: (completed: number, total: number) => void;
}

export function computeConstantReturnSeries(
  initial: number,
  monthlyContribution: number,
  totalMonths: number,
  annualRate: number,
  cashflow: CashflowInput
): number[] {
  const monthlyRate = Math.pow(Math.max(0.0001, 1 + annualRate), 1 / 12) - 1;
  const withdrawalMap = new Map<number, number>();
  for (const w of cashflow.plannedWithdrawals) {
    if (w.monthIndex >= 1 && w.monthIndex <= totalMonths && w.amount > 0) {
      withdrawalMap.set(w.monthIndex, (withdrawalMap.get(w.monthIndex) ?? 0) + w.amount);
    }
  }

  const series: number[] = [initial];
  let balance = initial;
  for (let m = 1; m <= totalMonths; m++) {
    balance = balance * (1 + monthlyRate);
    const isPaused =
      cashflow.contributionPauseStartMonth !== null &&
      m >= cashflow.contributionPauseStartMonth &&
      m < cashflow.contributionPauseStartMonth + cashflow.contributionPauseMonths;
    const growthFactor = Math.pow(1 + cashflow.annualIncomeGrowthRate, Math.floor((m - 1) / 12));
    const contrib = isPaused ? 0 : monthlyContribution * growthFactor;
    balance += contrib;
    const withdraw = withdrawalMap.get(m) ?? 0;
    if (withdraw > 0) {
      balance = Math.max(0, balance - withdraw);
    }
    series.push(balance);
  }
  return series;
}

export function runWealthSimulation(options: RunSimulationOptions): SimulationOutput {
  const tStart = performance.now();
  const {
    cashflow,
    analysis,
    portfolio,
    assetSpecs,
    correlationMatrix = DEFAULT_CORRELATION_MATRIX,
    mode,
    dataMode,
    historicalRows = [],
    bootstrapBlockLength = 12,
    runCount = 10_000,
    seed = 20261115,
    stressScenario = false,
    constantComparisonRate = 0.15,
    selectedPathIndex = 0,
    lossBudgetRatio = 0.1,
    onProgress,
  } = options;

  const horizonYears = Math.max(1, cashflow.retireAge - cashflow.currentAge);
  const totalMonths = horizonYears * 12;
  const initialAmount = Math.max(0, analysis.appliedInitialInvestment);
  const baseMonthlyContrib = Math.max(0, analysis.appliedMonthlyInvestment);

  const withdrawalMap = new Map<number, number>();
  for (const w of cashflow.plannedWithdrawals) {
    if (w.monthIndex >= 1 && w.monthIndex <= totalMonths && w.amount > 0) {
      withdrawalMap.set(w.monthIndex, (withdrawalMap.get(w.monthIndex) ?? 0) + w.amount);
    }
  }

  // Validate asset parameters: m > -1
  for (const id of ASSET_CLASS_ORDER) {
    if (assetSpecs[id].annualSimpleReturn <= -1) {
      throw new Error(`${assetSpecs[id].label} 기대수익률은 -100%보다 커야 합니다.`);
    }
  }

  const { L } = choleskyWithValidation(correlationMatrix);

  // Precompute monthly parametric parameters (with optional stress scenario & FX)
  const monthlyMuLog = ASSET_CLASS_ORDER.map((id) => {
    const spec = assetSpecs[id];
    const stressAdjReturn =
      stressScenario && (id === 'equity_index' || id === 'quality_stock')
        ? spec.annualSimpleReturn - 0.04
        : spec.annualSimpleReturn;
    const stressAdjVol =
      stressScenario && (id === 'equity_index' || id === 'quality_stock')
        ? spec.annualLogVolatility * 1.35
        : spec.annualLogVolatility;

    const mu = (Math.log(Math.max(1e-6, 1 + stressAdjReturn)) - 0.5 * stressAdjVol * stressAdjVol) / 12;
    return { mu, sigmaM: stressAdjVol / Math.sqrt(12), spec };
  });

  const targetWeightsArr = ASSET_CLASS_ORDER.map((id) => portfolio.assetWeights[id]);
  const constantSeries = computeConstantReturnSeries(
    initialAmount,
    baseMonthlyContrib,
    totalMonths,
    constantComparisonRate,
    cashflow
  );

  // Storage for monthly percentiles across all paths
  const monthBalances: Float64Array[] = Array.from(
    { length: totalMonths + 1 },
    () => new Float64Array(runCount)
  );
  const monthUnitNavs: Float64Array[] = Array.from(
    { length: totalMonths + 1 },
    () => new Float64Array(runCount)
  );
  const monthMaxDrawdowns: Float64Array[] = Array.from(
    { length: totalMonths + 1 },
    () => new Float64Array(runCount)
  );
  const monthContributed: Float64Array[] = Array.from(
    { length: totalMonths + 1 },
    () => new Float64Array(runCount)
  );
  const monthWithdrawn: Float64Array[] = Array.from(
    { length: totalMonths + 1 },
    () => new Float64Array(runCount)
  );
  const monthHasShortfall: Uint8Array[] = Array.from(
    { length: totalMonths + 1 },
    () => new Uint8Array(runCount)
  );

  const safeSelectedIdx = Math.max(0, Math.min(runCount - 1, selectedPathIndex));
  const selectedPath: SinglePathPoint[] = [];
  let selectedPathMaxDrawdown = 0;
  let selectedPathShortfalls = 0;

  const rng = createMulberry32(seed);
  const numAssets = ASSET_CLASS_ORDER.length;
  const zRaw = new Float64Array(numAssets);
  const corrShock = new Float64Array(numAssets);

  // Precompute rebalance cadence
  const rebalancePeriodMonths =
    portfolio.rebalanceMode === 'quarterly'
      ? 3
      : portfolio.rebalanceMode === 'semiannual'
      ? 6
      : portfolio.rebalanceMode === 'annual'
      ? 12
      : 1; // tactical checked monthly

  const blockLen = Math.max(1, Math.min(36, bootstrapBlockLength));
  const hasHistorical = mode === 'bootstrap' && historicalRows.length >= 2;

  for (let r = 0; r < runCount; r++) {
    if (onProgress && r > 0 && r % 1000 === 0) {
      onProgress(r, runCount);
    }

    // Track per-asset balances so drift and rebalancing are real
    const assetBal = new Float64Array(numAssets);
    for (let a = 0; a < numAssets; a++) {
      assetBal[a] = initialAmount * targetWeightsArr[a];
    }

    let unitNav = 1.0;
    let peakNav = 1.0;
    let maxDd = 0;
    let cumContrib = initialAmount;
    let cumWithdraw = 0;
    let hadShortfall = 0;

    // For Druckenmiller lagged t-1 trailing 6-month equity signal (zero look-ahead)
    const equityNavHistory: number[] = [1.0];
    let bootstrapCursor = 0;
    let bootstrapStartIdx = 0;

    monthBalances[0][r] = initialAmount;
    monthUnitNavs[0][r] = 1.0;
    monthMaxDrawdowns[0][r] = 0;
    monthContributed[0][r] = initialAmount;
    monthWithdrawn[0][r] = 0;

    if (r === safeSelectedIdx) {
      selectedPath.push({
        monthIndex: 0,
        age: cashflow.currentAge,
        nominalBalance: initialAmount,
        realBalance: initialAmount,
        netContributed: initialAmount,
        unitNav: 1.0,
        drawdown: 0,
        shortfallAmount: 0,
        weightsByAsset: { ...portfolio.assetWeights },
      });
    }

    for (let m = 1; m <= totalMonths; m++) {
      // 1. Determine active target weights BEFORE month m return (strictly using t-1 signal if tactical)
      const activeTargetWeights = [...targetWeightsArr];
      let signalLabel: string | undefined;

      if (portfolio.styleId === 'druckenmiller' && m > 6) {
        const nav6mAgo = equityNavHistory[m - 7];
        const navPrev = equityNavHistory[m - 1];
        const trailing6mRet = nav6mAgo > 0 ? navPrev / nav6mAgo - 1 : 0;

        if (trailing6mRet < -0.04) {
          // Defensive tilt: shift up to 12% from equity into cash/bond/gold
          const shiftFromEq = Math.min(activeTargetWeights[2] * 0.35, 0.12);
          const shiftFromStock = Math.min(activeTargetWeights[4] * 0.5, 0.04);
          const totalShift = shiftFromEq + shiftFromStock;
          activeTargetWeights[2] -= shiftFromEq;
          activeTargetWeights[4] -= shiftFromStock;
          activeTargetWeights[0] += totalShift * 0.45;
          activeTargetWeights[1] += totalShift * 0.35;
          activeTargetWeights[3] += totalShift * 0.2;
          signalLabel = '하락 추세 방어(현금·채권·금 확대)';
        } else if (trailing6mRet > 0.08 && portfolio.profileId !== 'conservative') {
          // Constructive tilt capped within risk limit
          const shiftFromBond = Math.min(activeTargetWeights[1] * 0.25, 0.06);
          activeTargetWeights[1] -= shiftFromBond;
          activeTargetWeights[2] += shiftFromBond;
          signalLabel = '상승 추세 우호(분산지수 소폭 확대)';
        }
      }

      // 2. Generate asset monthly simple returns (net of annual fee / 12)
      const assetMonthlyReturns = new Float64Array(numAssets);

      if (hasHistorical) {
        if (bootstrapCursor === 0 || bootstrapCursor >= blockLen) {
          bootstrapStartIdx = Math.floor(rng() * historicalRows.length);
          bootstrapCursor = 0;
        }
        const row = historicalRows[(bootstrapStartIdx + bootstrapCursor) % historicalRows.length];
        bootstrapCursor++;
        for (let a = 0; a < numAssets; a++) {
          const id = ASSET_CLASS_ORDER[a];
          const feeM = assetSpecs[id].annualFee / 12;
          assetMonthlyReturns[a] = Math.max(-0.95, row.returns[id] - feeM);
        }
      } else {
        for (let a = 0; a < numAssets; a++) {
          zRaw[a] = sampleNormal(rng);
        }
        for (let i = 0; i < numAssets; i++) {
          let sum = 0;
          for (let j = 0; j <= i; j++) {
            sum += L[i][j] * zRaw[j];
          }
          corrShock[i] = sum;
        }
        for (let a = 0; a < numAssets; a++) {
          const { mu, sigmaM, spec } = monthlyMuLog[a];
          const localSimple = Math.exp(mu + sigmaM * corrShock[a]) - 1;
          let krwSimple = localSimple;

          // Apply FX shock once for FX-exposed assets: (1+r)(1+f)-1
          if (spec.fxExposed && (spec.annualFxVolatility > 0 || spec.annualFxReturn !== 0)) {
            const fxMu =
              (Math.log(Math.max(1e-6, 1 + spec.annualFxReturn)) -
                0.5 * spec.annualFxVolatility * spec.annualFxVolatility) /
              12;
            const fxSig = spec.annualFxVolatility / Math.sqrt(12);
            const fSimple = Math.exp(fxMu + fxSig * sampleNormal(rng)) - 1;
            krwSimple = (1 + localSimple) * (1 + fSimple) - 1;
          }

          const feeM = spec.annualFee / 12;
          assetMonthlyReturns[a] = Math.max(-0.95, krwSimple - feeM);
        }
      }

      // Track equity index NAV for lagged tactical signal
      equityNavHistory.push(equityNavHistory[equityNavHistory.length - 1] * (1 + assetMonthlyReturns[2]));

      // 3. Apply returns to existing holdings & compute pure portfolio return for Unit NAV (TWR)
      let totalBeforeReturn = 0;
      let totalAfterReturn = 0;
      for (let a = 0; a < numAssets; a++) {
        totalBeforeReturn += assetBal[a];
        assetBal[a] = assetBal[a] * (1 + assetMonthlyReturns[a]);
        totalAfterReturn += assetBal[a];
      }

      let periodPortReturn = 0;
      if (totalBeforeReturn > 0) {
        periodPortReturn = totalAfterReturn / totalBeforeReturn - 1;
      } else {
        for (let a = 0; a < numAssets; a++) {
          periodPortReturn += activeTargetWeights[a] * assetMonthlyReturns[a];
        }
      }

      // 4. Rebalancing & transaction cost (only on rebalance months)
      const shouldRebalance =
        totalAfterReturn > 0 &&
        (m % rebalancePeriodMonths === 0 || portfolio.styleId === 'druckenmiller');
      let rebalanceCostFrac = 0;
      if (shouldRebalance) {
        let turnover = 0;
        for (let a = 0; a < numAssets; a++) {
          const curW = assetBal[a] / totalAfterReturn;
          turnover += Math.abs(curW - activeTargetWeights[a]);
        }
        turnover *= 0.5;
        rebalanceCostFrac = turnover * portfolio.rebalanceCostRate;
        const postRebTotal = Math.max(0, totalAfterReturn * (1 - rebalanceCostFrac));
        for (let a = 0; a < numAssets; a++) {
          assetBal[a] = postRebTotal * activeTargetWeights[a];
        }
        totalAfterReturn = postRebTotal;
      }

      unitNav = unitNav * (1 + periodPortReturn) * (1 - rebalanceCostFrac);
      if (unitNav > peakNav) peakNav = unitNav;
      const curDd = peakNav > 0 ? (peakNav - unitNav) / peakNav : 0;
      if (curDd > maxDd) maxDd = curDd;

      // 5. End-of-month Contribution (respecting pause & income growth)
      const isPaused =
        cashflow.contributionPauseStartMonth !== null &&
        m >= cashflow.contributionPauseStartMonth &&
        m < cashflow.contributionPauseStartMonth + cashflow.contributionPauseMonths;
      const growthFactor = Math.pow(1 + cashflow.annualIncomeGrowthRate, Math.floor((m - 1) / 12));
      const contrib = isPaused ? 0 : baseMonthlyContrib * growthFactor;

      if (contrib > 0) {
        for (let a = 0; a < numAssets; a++) {
          assetBal[a] += contrib * activeTargetWeights[a];
        }
        totalAfterReturn += contrib;
        cumContrib += contrib;
      }

      // 6. Planned Withdrawal (never goes negative; record shortfall if insufficient)
      let shortfallAmt = 0;
      const withdrawReq = withdrawalMap.get(m) ?? 0;
      if (withdrawReq > 0) {
        if (withdrawReq >= totalAfterReturn) {
          shortfallAmt = withdrawReq - totalAfterReturn;
          cumWithdraw += totalAfterReturn;
          for (let a = 0; a < numAssets; a++) assetBal[a] = 0;
          totalAfterReturn = 0;
          hadShortfall = 1;
        } else {
          const remainRatio = (totalAfterReturn - withdrawReq) / totalAfterReturn;
          for (let a = 0; a < numAssets; a++) assetBal[a] *= remainRatio;
          totalAfterReturn -= withdrawReq;
          cumWithdraw += withdrawReq;
        }
      }

      monthBalances[m][r] = totalAfterReturn;
      monthUnitNavs[m][r] = unitNav;
      monthMaxDrawdowns[m][r] = maxDd;
      monthContributed[m][r] = cumContrib;
      monthWithdrawn[m][r] = cumWithdraw;
      monthHasShortfall[m][r] = hadShortfall;

      if (r === safeSelectedIdx) {
        const inflationDeflator = Math.pow(1 + cashflow.annualInflationRate, m / 12);
        const weightsSnap: Record<AssetClassId, number> = { ...portfolio.assetWeights };
        if (totalAfterReturn > 0) {
          for (let a = 0; a < numAssets; a++) {
            weightsSnap[ASSET_CLASS_ORDER[a]] = assetBal[a] / totalAfterReturn;
          }
        }
        if (shortfallAmt > 0) selectedPathShortfalls += 1;
        selectedPathMaxDrawdown = maxDd;
        selectedPath.push({
          monthIndex: m,
          age: Number((cashflow.currentAge + m / 12).toFixed(2)),
          nominalBalance: totalAfterReturn,
          realBalance: totalAfterReturn / inflationDeflator,
          netContributed: cumContrib - cumWithdraw,
          unitNav,
          drawdown: curDd,
          shortfallAmount: shortfallAmt,
          weightsByAsset: weightsSnap,
          signalLabel,
        });
      }
    }
  }

  // Helper to build MilestoneStats at any month index
  const buildMilestone = (label: string, mIdx: number): MilestoneStats => {
    const yearsElapsed = mIdx / 12;
    const inflDeflator = Math.pow(1 + cashflow.annualInflationRate, yearsElapsed);

    const balances = new Float64Array(monthBalances[mIdx]);
    const navs = new Float64Array(monthUnitNavs[mIdx]);
    const mdds = new Float64Array(monthMaxDrawdowns[mIdx]);

    let sumBal = 0;
    let sumNav = 0;
    let sumContrib = 0;
    let sumWithdraw = 0;
    let lossCount = 0;
    let targetCount = 0;
    let lossBudgetExceedCount = 0;
    let shortfallCount = 0;

    for (let r = 0; r < runCount; r++) {
      const bal = balances[r];
      const nav = navs[r];
      const contrib = monthContributed[mIdx][r];
      const withdraw = monthWithdrawn[mIdx][r];
      const netPrincipal = Math.max(0, contrib - withdraw);

      sumBal += bal;
      sumNav += nav;
      sumContrib += contrib;
      sumWithdraw += withdraw;

      if (bal < netPrincipal) lossCount++;
      if (bal >= cashflow.targetAmount) targetCount++;
      if (netPrincipal > 0 && (netPrincipal - bal) / netPrincipal > lossBudgetRatio) {
        lossBudgetExceedCount++;
      } else if (nav - 1 < -lossBudgetRatio) {
        lossBudgetExceedCount++;
      }
      if (monthHasShortfall[mIdx][r] === 1) shortfallCount++;
    }

    balances.sort();
    navs.sort();
    mdds.sort();

    const nominalMean = sumBal / runCount;
    const nominalMedian = getPercentileSorted(balances, 0.5);
    const nominalP5 = getPercentileSorted(balances, 0.05);
    const nominalP25 = getPercentileSorted(balances, 0.25);
    const nominalP75 = getPercentileSorted(balances, 0.75);
    const nominalP95 = getPercentileSorted(balances, 0.95);

    const totalContributedMean = sumContrib / runCount;
    const totalWithdrawnMean = sumWithdraw / runCount;
    const netContribMean = totalContributedMean - totalWithdrawnMean;

    const twrTotalReturnMean = sumNav / runCount - 1;
    const twrTotalReturnMedian = getPercentileSorted(navs, 0.5) - 1;
    const twrTotalReturnP5 = getPercentileSorted(navs, 0.05) - 1;

    const twrAnnualizedMedian =
      yearsElapsed >= 1
        ? Math.pow(Math.max(1e-6, 1 + twrTotalReturnMedian), 1 / yearsElapsed) - 1
        : twrTotalReturnMedian;
    const twrAnnualizedP5 =
      yearsElapsed >= 1
        ? Math.pow(Math.max(1e-6, 1 + twrTotalReturnP5), 1 / yearsElapsed) - 1
        : twrTotalReturnP5;

    return {
      label,
      monthIndex: mIdx,
      yearsElapsed,
      totalContributedMean,
      totalWithdrawnMean,
      nominalMean,
      nominalMedian,
      nominalP5,
      nominalP25,
      nominalP75,
      nominalP95,
      realMean: nominalMean / inflDeflator,
      realMedian: nominalMedian / inflDeflator,
      realP5: nominalP5 / inflDeflator,
      realP95: nominalP95 / inflDeflator,
      meanProfit: nominalMean - netContribMean,
      medianProfit: nominalMedian - netContribMean,
      twrTotalReturnMedian,
      twrTotalReturnMean,
      twrTotalReturnP5,
      twrAnnualizedMedian,
      twrAnnualizedP5,
      lossVsNetPrincipalProb: lossCount / runCount,
      targetAchievedProb: targetCount / runCount,
      lossBudgetExceededProb: lossBudgetExceedCount / runCount,
      maxDrawdownMedian: getPercentileSorted(mdds, 0.5),
      maxDrawdownP95Worst: getPercentileSorted(mdds, 0.95),
      shortfallPathProb: shortfallCount / runCount,
      constantReturnBenchmarkValue: constantSeries[mIdx] ?? constantSeries[constantSeries.length - 1],
    };
  };

  // Build fan series (sample every 1 month for short horizons, or every 3/6 months if very long for crisp SVG rendering)
  const fanStride = totalMonths <= 120 ? 1 : 3;
  const fanSeries: FanSeriesPoint[] = [];
  for (let m = 0; m <= totalMonths; m++) {
    if (m !== 0 && m !== totalMonths && m % fanStride !== 0) continue;
    const sorted = new Float64Array(monthBalances[m]);
    sorted.sort();
    const inflDeflator = Math.pow(1 + cashflow.annualInflationRate, m / 12);
    const p50 = getPercentileSorted(sorted, 0.5);
    fanSeries.push({
      monthIndex: m,
      age: Number((cashflow.currentAge + m / 12).toFixed(2)),
      p5: getPercentileSorted(sorted, 0.05),
      p25: getPercentileSorted(sorted, 0.25),
      p50,
      p75: getPercentileSorted(sorted, 0.75),
      p95: getPercentileSorted(sorted, 0.95),
      realP50: p50 / inflDeflator,
      constantBenchmark: constantSeries[m],
    });
  }

  const finalSortedArr = Array.from(monthBalances[totalMonths]).sort((a, b) => a - b);
  const oneYear = totalMonths >= 12 ? buildMilestone('1년 후', 12) : null;
  const tenYear = totalMonths >= 120 ? buildMilestone('10년 후', 120) : null;
  const horizonEnd = buildMilestone(`은퇴 시점 (${cashflow.retireAge}세)`, totalMonths);

  const pLoss = horizonEnd.lossVsNetPrincipalProb;
  const monteCarloSeAtLossProb = Math.sqrt((pLoss * (1 - pLoss)) / Math.max(1, runCount));

  if (onProgress) onProgress(runCount, runCount);

  return {
    runCount,
    seed,
    mode,
    dataMode,
    stressScenario,
    modelVersion: MODEL_VERSION,
    dataVersion: DATA_VERSION,
    totalMonths,
    horizonYears,
    constantComparisonRate,
    assetSpecsUsed: assetSpecs,
    portfolioUsed: portfolio,
    milestones: {
      oneYear,
      tenYear,
      horizonEnd,
    },
    fanSeries,
    selectedPathIndex: safeSelectedIdx,
    selectedPath,
    selectedPathMaxDrawdown,
    selectedPathTwrTotal:
      selectedPath.length > 0 ? selectedPath[selectedPath.length - 1].unitNav - 1 : 0,
    selectedPathShortfalls,
    finalValuesSorted: finalSortedArr,
    monteCarloSeAtLossProb,
    elapsedMs: Math.round(performance.now() - tStart),
  };
}
