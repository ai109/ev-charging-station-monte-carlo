import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GridPointResult,
  StationParams,
  WorkerResponse,
} from "./sim/types";
import { Controls, type ControlsValue } from "./components/Controls";
import { KpiCards } from "./components/KpiCards";
import { Charts } from "./components/Charts";
import { ReportPanel } from "./components/ReportPanel";

export default function App() {
  const workerRef = useRef<Worker | null>(null);

  const [running, setRunning] = useState(false);
  const [progressText, setProgressText] = useState<string>("");
  const [results, setResults] = useState<GridPointResult[] | null>(null);
  const [best, setBest] = useState<GridPointResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [controls, setControls] = useState<ControlsValue>({
    nGrid: { nMin: 1, nMax: 8 },
    pGrid: { pMin: 0.45, pMax: 0.85, pStep: 0.05 },
    mcRuns: 120,
    seed: 12345,
    maxDropRateEnabled: true,
    maxDropRate: 0.12,
    maxP95Enabled: true,
    maxP95WaitMin: 12,
  });

  const params: StationParams = useMemo(
    () => ({
      powerKw: 100,
      qMax: 8,
      openHours: 24,

      gridCostPerKwh: 0.2,
      fixedCostPerStallPerYear: 4500,
      fixedCostPerYear: 12000,

      baseArrivalsPerHourByMonth: [
        1.2, 1.1, 1.0, 1.1, 1.3, 1.6, 1.8, 1.7, 1.4, 1.2, 1.1, 1.2,
      ],
      avgTempCByMonth: [-1, 1, 5, 10, 15, 20, 23, 22, 17, 11, 5, 1],
      tempSensitivity: 0.02,
      refTempC: 12,

      pRef: 0.6,
      priceSensitivity: 0.85,
      minDemandFactor: 0.55,
      maxDemandFactor: 1.15,

      energyKwhMean: 28,
      energyKwhStd: 10,
      energyKwhMin: 8,
      energyKwhMax: 70,

      waitTolMeanMin: 12,
      waitTolStdMin: 6,
      waitTolMin: 2,
      waitTolMax: 35,
    }),
    [],
  );

  useEffect(() => {
    const w = new Worker(new URL("./sim/worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = w;

    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;

      if (msg.type === "progress" && msg.progress) {
        setProgressText(msg.progress.message ?? "");
        setRunning(msg.progress.stage === "running");
      }

      if (msg.type === "result") {
        setResults(msg.results ?? null);
        setBest(msg.best ?? null);
        setRunning(false);
        setProgressText("Done");
      }

      if (msg.type === "error") {
        setError(msg.error ?? "Unknown error");
        setRunning(false);
      }
    };

    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = () => {
    setError(null);
    setResults(null);
    setBest(null);
    setRunning(true);
    setProgressText("Starting...");

    workerRef.current?.postMessage({
      type: "run-grid",
      params,
      config: {
        nGrid: controls.nGrid,
        pGrid: controls.pGrid,
        mcRuns: controls.mcRuns,
        seed: controls.seed,
        maxDropRate: controls.maxDropRateEnabled
          ? controls.maxDropRate
          : undefined,
        maxP95WaitMin: controls.maxP95Enabled
          ? controls.maxP95WaitMin
          : undefined,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">EV Charging Monte Carlo</h1>
            <div className="text-sm opacity-70">
              Grid search over (N, price) • Seasonality + stochastic arrivals +
              queueing
            </div>
          </div>
          <div className="text-sm opacity-70">{progressText}</div>
        </header>

        <Controls
          value={controls}
          onChange={setControls}
          onRun={run}
          running={running}
        />

        {error && (
          <div className="rounded-lg bg-red-100 text-red-800 p-3">{error}</div>
        )}

        <KpiCards best={best} />

        <ReportPanel params={params} best={best} results={results} />

        {results && <Charts results={results} />}
      </div>
    </div>
  );
}
