/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CashflowDashboardView } from './components/CashflowDashboardView';
import { CashflowInputView } from './components/CashflowInputView';
import { DataAndMethodologyView } from './components/DataAndMethodologyView';
import { PortfolioView } from './components/PortfolioView';
import { QuickGbmSimulatorView } from './components/QuickGbmSimulatorView';
import { TimeTravelView } from './components/TimeTravelView';
import { AppStepId, TopNav } from './components/TopNav';
import { SAMPLE_HISTORICAL_ROWS } from './data/historicalSample';
import { DEFAULT_ASSET_SPECS } from './data/instruments';
import { DEMO_PERSONAS } from './data/presets';
import { analyzeCashflow, validateCashflowInput } from './engine/cashflow';
import {
  buildQuickShareUrl,
  parseQuickParamsFromSearch,
  QUICK_MONTE_CARLO_RUNS,
  QUICK_RISK_PROFILES,
  QuickHorizonId,
  QuickMonteCarloResult,
  QuickRiskProfileId,
  QuickSimParams,
  QuickSingleRunResult,
  runQuickMonteCarlo,
  runQuickSingleSimulation,
} from './engine/gbmQuickSim';
import { buildPortfolioRecommendation, evaluateRiskProfile } from './engine/portfolio';
import { runWealthSimulation } from './engine/simulator';
import {
  AssetClassId,
  AssetClassSpec,
  CashflowInput,
  DataMode,
  HistoricalMonthlyRow,
  InvestorStyleId,
  RiskAssessmentInput,
  SimulationMode,
  SimulationOutput,
} from './types/wealth';
import type { WorkerMessage } from './workers/simulation.worker';

const STORAGE_KEY = 'naeil_asset_state_v1';

export default function App() {
  const initialUrlParsed = useMemo(
    () =>
      parseQuickParamsFromSearch(
        typeof window !== 'undefined' ? window.location.search : ''
      ),
    []
  );

  const [activeStep, setActiveStep] = useState<AppStepId>(() =>
    initialUrlParsed.hasQuickQuery ? 'quick' : 'input'
  );

  // Quick GBM Dice & 10,000-Run Simulator State (100% browser JS, zero API calls)
  const [quickParams, setQuickParams] = useState<QuickSimParams>(initialUrlParsed.params);
  const quickRunCounterRef = useRef(1);
  const [quickSingleRun, setQuickSingleRun] = useState<QuickSingleRunResult>(() =>
    runQuickSingleSimulation(initialUrlParsed.params, 1)
  );
  const [quickRecentRuns, setQuickRecentRuns] = useState<QuickSingleRunResult[]>(() => [
    quickSingleRun,
  ]);
  const [quickMonteCarlo, setQuickMonteCarlo] = useState<QuickMonteCarloResult>(() =>
    runQuickMonteCarlo(initialUrlParsed.params, QUICK_MONTE_CARLO_RUNS)
  );
  const [quickAnimKey, setQuickAnimKey] = useState(1);
  const [isRunningQuickMc, setIsRunningQuickMc] = useState(false);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);

  // Youth Cashflow & Wealth Simulator State
  const [cashflow, setCashflow] = useState<CashflowInput>(() =>
    structuredClone(DEMO_PERSONAS[1].cashflow)
  );
  const [riskInput, setRiskInput] = useState<RiskAssessmentInput>(() =>
    structuredClone(DEMO_PERSONAS[1].risk)
  );
  const [styleId, setStyleId] = useState<InvestorStyleId>('balanced_core');
  const [customWeights, setCustomWeights] = useState<Record<AssetClassId, number> | null>(null);
  const [assetSpecs, setAssetSpecs] = useState<Record<AssetClassId, AssetClassSpec>>(
    () => structuredClone(DEFAULT_ASSET_SPECS)
  );
  const [dataMode, setDataMode] = useState<DataMode>('dev_assumption');
  const [historicalRows, setHistoricalRows] = useState<HistoricalMonthlyRow[]>(
    () => SAMPLE_HISTORICAL_ROWS
  );
  const [simMode, setSimMode] = useState<SimulationMode>('parametric');
  const [bootstrapBlockLength, setBootstrapBlockLength] = useState<number>(12);
  const [stressScenario, setStressScenario] = useState<boolean>(false);
  const [constantRate, setConstantRate] = useState<number>(0.15);
  const [seed, setSeed] = useState<number>(20261115);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number>(0);

  const [aiAvailable, setAiAvailable] = useState<boolean>(false);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);

  // Sync quick simulator parameters to URL query string
  useEffect(() => {
    try {
      const shareUrl = buildQuickShareUrl(window.location.href, quickParams);
      window.history.replaceState(null, '', shareUrl);
    } catch {
      // Ignore restricted history errors
    }
  }, [quickParams]);

  const applyQuickConfig = useCallback((next: QuickSimParams) => {
    setQuickParams(next);
    quickRunCounterRef.current += 1;
    const nextSingle = runQuickSingleSimulation(next, quickRunCounterRef.current);
    setQuickSingleRun(nextSingle);
    setQuickRecentRuns([nextSingle]);
    setQuickMonteCarlo(runQuickMonteCarlo(next, QUICK_MONTE_CARLO_RUNS));
    setQuickAnimKey((k) => k + 1);
  }, []);

  const handleQuickChangePrincipal = useCallback(
    (principal: number) => {
      if (principal === quickParams.principal) return;
      applyQuickConfig({ ...quickParams, principal });
    },
    [quickParams, applyQuickConfig]
  );

  const handleQuickSelectProfile = useCallback(
    (profileId: QuickRiskProfileId) => {
      const preset = QUICK_RISK_PROFILES[profileId];
      applyQuickConfig({
        ...quickParams,
        profileId,
        annualReturn: preset.defaultAnnualReturn,
        annualVolatility: preset.defaultAnnualVolatility,
      });
    },
    [quickParams, applyQuickConfig]
  );

  const handleQuickSelectHorizon = useCallback(
    (horizonId: QuickHorizonId) => {
      if (horizonId === quickParams.horizonId) return;
      applyQuickConfig({ ...quickParams, horizonId });
    },
    [quickParams, applyQuickConfig]
  );

  const handleQuickChangeAssumptions = useCallback(
    (annualReturn: number, annualVolatility: number) => {
      applyQuickConfig({ ...quickParams, annualReturn, annualVolatility });
    },
    [quickParams, applyQuickConfig]
  );

  const handleQuickResetAssumptions = useCallback(() => {
    const preset = QUICK_RISK_PROFILES[quickParams.profileId];
    applyQuickConfig({
      ...quickParams,
      annualReturn: preset.defaultAnnualReturn,
      annualVolatility: preset.defaultAnnualVolatility,
    });
  }, [quickParams, applyQuickConfig]);

  const handleQuickRunSingle = useCallback(() => {
    quickRunCounterRef.current += 1;
    const nextSingle = runQuickSingleSimulation(quickParams, quickRunCounterRef.current);
    setQuickSingleRun(nextSingle);
    setQuickRecentRuns((prev) => [nextSingle, ...prev].slice(0, 4));
    setQuickAnimKey((k) => k + 1);
  }, [quickParams]);

  const handleQuickRunMonteCarlo = useCallback(() => {
    setIsRunningQuickMc(true);
    window.setTimeout(() => {
      setQuickMonteCarlo(runQuickMonteCarlo(quickParams, QUICK_MONTE_CARLO_RUNS));
      setIsRunningQuickMc(false);
    }, 16);
  }, [quickParams]);

  const handleCopyShareLink = useCallback(async () => {
    const shareUrl = buildQuickShareUrl(window.location.href, quickParams);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      setShareFallbackUrl(null);
      window.setTimeout(() => setCopiedShareUrl(false), 2200);
    } catch {
      setShareFallbackUrl(shareUrl);
    }
  }, [quickParams]);

  // Check optional server-side AI status without blocking app
  useEffect(() => {
    let active = true;
    fetch('/api/ai/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.available === 'boolean') {
          setAiAvailable(data.available);
        }
      })
      .catch(() => {
        if (active) setAiAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const [persistLocal, setPersistLocal] = useState<boolean>(() => {
    try {
      return Boolean(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  });

  // Load optional saved state from localStorage if previously stored
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed?.cashflow) setCashflow(parsed.cashflow);
      if (parsed?.riskInput) setRiskInput(parsed.riskInput);
      if (parsed?.styleId) setStyleId(parsed.styleId);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      if (persistLocal) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ cashflow, riskInput, styleId })
        );
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [persistLocal, cashflow, riskInput, styleId]);

  const validationErrors = useMemo(() => validateCashflowInput(cashflow), [cashflow]);
  const analysis = useMemo(() => analyzeCashflow(cashflow), [cashflow]);
  const riskEval = useMemo(
    () => evaluateRiskProfile(cashflow, analysis, riskInput),
    [cashflow, analysis, riskInput]
  );
  const portfolio = useMemo(
    () =>
      buildPortfolioRecommendation(
        riskEval.appliedProfile,
        styleId,
        cashflow,
        analysis,
        riskInput,
        assetSpecs,
        customWeights
      ),
    [riskEval.appliedProfile, styleId, cashflow, analysis, riskInput, assetSpecs, customWeights]
  );

  const [simulation, setSimulation] = useState<SimulationOutput>(() =>
    runWealthSimulation({
      cashflow,
      analysis,
      portfolio,
      assetSpecs,
      mode: simMode,
      dataMode,
      historicalRows,
      bootstrapBlockLength,
      runCount: 500,
      seed,
      stressScenario,
      constantComparisonRate: constantRate,
      selectedPathIndex,
    })
  );

  const launchMonteCarloWorker = useCallback(
    (overrideSeed?: number, overridePathIdx?: number) => {
      const activeSeed = overrideSeed ?? seed;
      const activePathIdx = overridePathIdx ?? selectedPathIndex;
      const lossRatio =
        riskInput.lossBudgetReferenceCapital > 0
          ? riskInput.lossBudgetMaxAmount / riskInput.lossBudgetReferenceCapital
          : 0.1;

      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      const nextReqId = ++requestIdRef.current;
      const options = {
        cashflow,
        analysis,
        portfolio,
        assetSpecs,
        mode: simMode,
        dataMode,
        historicalRows,
        bootstrapBlockLength,
        runCount: 10_000,
        seed: activeSeed,
        stressScenario,
        constantComparisonRate: constantRate,
        selectedPathIndex: activePathIdx,
        lossBudgetRatio: lossRatio,
      };

      if (typeof Worker !== 'undefined') {
        setIsComputing(true);
        setProgress({ completed: 0, total: 10_000 });
        try {
          const worker = new Worker(
            new URL('./workers/simulation.worker.ts', import.meta.url),
            { type: 'module' }
          );
          workerRef.current = worker;

          worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
            const msg = ev.data;
            if (msg.requestId !== requestIdRef.current) return;
            if (msg.type === 'progress') {
              setProgress({ completed: msg.completed, total: msg.total });
            } else if (msg.type === 'result') {
              setSimulation(msg.output);
              setIsComputing(false);
              setProgress(null);
              worker.terminate();
              workerRef.current = null;
            } else if (msg.type === 'error') {
              setIsComputing(false);
              setProgress(null);
              worker.terminate();
              workerRef.current = null;
            }
          };

          worker.onerror = () => {
            setIsComputing(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
            setSimulation(runWealthSimulation(options));
          };

          worker.postMessage({ requestId: nextReqId, options });
          return;
        } catch {
          // Fall through to synchronous fallback
        }
      }

      setSimulation(runWealthSimulation(options));
      setIsComputing(false);
      setProgress(null);
    },
    [
      cashflow,
      analysis,
      portfolio,
      assetSpecs,
      simMode,
      dataMode,
      historicalRows,
      bootstrapBlockLength,
      seed,
      stressScenario,
      constantRate,
      selectedPathIndex,
      riskInput,
    ]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      launchMonteCarloWorker();
    }, 120);
    return () => {
      window.clearTimeout(t);
    };
  }, [launchMonteCarloWorker]);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const handleCancelComputation = () => {
    requestIdRef.current += 1;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsComputing(false);
    setProgress(null);
  };

  const handleApplyPreset = (presetId: string) => {
    const found = DEMO_PERSONAS.find((p) => p.id === presetId);
    if (!found) return;
    setCashflow(structuredClone(found.cashflow));
    setRiskInput(structuredClone(found.risk));
    setCustomWeights(null);
    setActiveStep('dashboard');
  };

  const handleExportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            cashflow,
            riskInput,
            styleId,
            assetWeights: portfolio.assetWeights,
            quickParams,
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'naeil-asset-plan.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAllData = () => {
    setPersistLocal(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    setCashflow(structuredClone(DEMO_PERSONAS[1].cashflow));
    setRiskInput(structuredClone(DEMO_PERSONAS[1].risk));
    setStyleId('balanced_core');
    setCustomWeights(null);
    setAssetSpecs(structuredClone(DEFAULT_ASSET_SPECS));
    setDataMode('dev_assumption');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopNav
        activeStep={activeStep}
        copiedShareUrl={copiedShareUrl}
        onSelectStep={setActiveStep}
        onCopyShareLink={handleCopyShareLink}
      />

      {shareFallbackUrl && (
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2 text-xs text-slate-800 sm:px-6 lg:px-8">
            <span className="truncate font-mono">{shareFallbackUrl}</span>
            <button
              type="button"
              onClick={() => setShareFallbackUrl(null)}
              className="shrink-0 font-semibold text-[#1D4ED8] hover:underline"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {activeStep === 'quick' && (
          <QuickGbmSimulatorView
            params={quickParams}
            singleRun={quickSingleRun}
            recentRuns={quickRecentRuns}
            monteCarlo={quickMonteCarlo}
            animationKey={quickAnimKey}
            isRunningMc={isRunningQuickMc}
            analyzedInitialCash={analysis.appliedInitialInvestment}
            onChangePrincipal={handleQuickChangePrincipal}
            onSelectProfile={handleQuickSelectProfile}
            onSelectHorizon={handleQuickSelectHorizon}
            onChangeAssumptions={handleQuickChangeAssumptions}
            onResetAssumptions={handleQuickResetAssumptions}
            onRunSingle={handleQuickRunSingle}
            onRunMonteCarlo={handleQuickRunMonteCarlo}
            onSelectHistoryRun={(run) => {
              setQuickSingleRun(run);
              setQuickAnimKey((k) => k + 1);
            }}
          />
        )}

        {activeStep === 'input' && (
          <CashflowInputView
            cashflow={cashflow}
            validationErrors={validationErrors}
            aiAvailable={aiAvailable}
            onChangeCashflow={setCashflow}
            onApplyPreset={handleApplyPreset}
            onGoNext={() => setActiveStep('dashboard')}
          />
        )}

        {activeStep === 'dashboard' && (
          <CashflowDashboardView
            cashflow={cashflow}
            analysis={analysis}
            onGoBack={() => setActiveStep('input')}
            onGoNext={() => setActiveStep('portfolio')}
          />
        )}

        {activeStep === 'portfolio' && (
          <PortfolioView
            cashflow={cashflow}
            analysis={analysis}
            riskInput={riskInput}
            riskEval={riskEval}
            styleId={styleId}
            customWeights={customWeights}
            portfolio={portfolio}
            assetSpecs={assetSpecs}
            seed={seed}
            onChangeRiskInput={setRiskInput}
            onSelectStyle={setStyleId}
            onChangeCustomWeights={setCustomWeights}
            onGoSimulation={() => setActiveStep('timetravel')}
          />
        )}

        {activeStep === 'timetravel' && (
          <TimeTravelView
            cashflow={cashflow}
            analysis={analysis}
            riskEval={riskEval}
            portfolio={portfolio}
            simulation={simulation}
            simMode={simMode}
            dataMode={dataMode}
            bootstrapBlockLength={bootstrapBlockLength}
            stressScenario={stressScenario}
            constantRate={constantRate}
            seed={seed}
            isComputing={isComputing}
            progress={progress}
            aiAvailable={aiAvailable}
            onChangeSimMode={setSimMode}
            onChangeBlockLength={setBootstrapBlockLength}
            onToggleStress={setStressScenario}
            onChangeConstantRate={setConstantRate}
            onChangeSeed={setSeed}
            onRunNewMonteCarlo={(newSeed) => {
              setSeed(newSeed);
              launchMonteCarloWorker(newSeed, selectedPathIndex);
            }}
            onCancelComputation={handleCancelComputation}
            onSelectPathIndex={(idx) => {
              setSelectedPathIndex(idx);
              launchMonteCarloWorker(seed, idx);
            }}
          />
        )}

        {activeStep === 'data' && (
          <DataAndMethodologyView
            dataMode={dataMode}
            assetSpecs={assetSpecs}
            historicalRows={historicalRows}
            styleId={styleId}
            profileId={riskEval.appliedProfile}
            onChangeDataMode={setDataMode}
            onChangeAssetSpecs={setAssetSpecs}
            onImportCustomRows={setHistoricalRows}
            onExportJson={handleExportJson}
            onClearAllData={handleClearAllData}
            persistLocal={persistLocal}
            onTogglePersistLocal={setPersistLocal}
          />
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p>내일의 자산 · 청년 현금흐름 기반 자산 형성 시뮬레이터</p>
          <p>
            모든 수치는 세전 모형 계산 결과이며, 실제 투자 권유·수익 보장·손실 상한 보장이 아닙니다.
          </p>
        </div>
      </footer>
    </div>
  );
}
