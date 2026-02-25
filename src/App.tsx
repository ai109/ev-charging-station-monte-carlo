import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GridPointResult,
  StationParams,
  WorkerResponse,
} from "./sim/types";
import { Charts } from "./components/Charts";

export default function App() {
  const workerRef = useRef<Worker | null>(null);

  const [running, setRunning] = useState(false);
  const [progressText, setProgressText] = useState<string>("");
  const [results, setResults] = useState<GridPointResult[] | null>(null);
  const [best, setBest] = useState<GridPointResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ Default params (можеш да ги изнесеш после в Controls.tsx)
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
        setProgressText(`${msg.progress.message}`);
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
        nGrid: { nMin: 1, nMax: 8 },
        pGrid: { pMin: 0.45, pMax: 0.85, pStep: 0.05 },
        mcRuns: 120,
        seed: 12345,

        // Constraints (по желание)
        maxDropRate: 0.12,
        maxP95WaitMin: 12,
      },
    });
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">EV Charging Monte Carlo</h1>

        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={run}
          disabled={running}
        >
          {running ? "Running..." : "Run simulation"}
        </button>

        <div className="text-sm opacity-80">{progressText}</div>

        {error && (
          <div className="p-3 rounded bg-red-100 text-red-800">{error}</div>
        )}

        {best && (
          <div className="p-4 rounded border">
            <div className="font-semibold">Best under constraints</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>N: {best.N}</div>
              <div>p: {best.p.toFixed(2)} €/kWh</div>
              <div>Profit: {best.mean.profit.toFixed(0)} €</div>
              <div>DropRate: {(best.dropRate * 100).toFixed(1)}%</div>
              <div>P95 wait: {best.mean.p95WaitMin.toFixed(1)} min</div>
              <div>
                Utilization: {(best.mean.utilization * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        {results && <Charts results={results} />}
      </div>
    </div>
  );
}
