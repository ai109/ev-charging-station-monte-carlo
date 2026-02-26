// src/sim/worker.ts

import { gridSearch } from "./gridSearch";
import { type WorkerRequest, type WorkerResponse } from "./types";

// Vite Web Worker entry
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  if (msg.type !== "run-grid") return;

  try {
    const { params, config } = msg;

    const nCount = Math.max(0, config.nGrid.nMax - config.nGrid.nMin + 1);
    const pCount =
      config.pGrid.pStep > 0
        ? Math.max(
            0,
            Math.floor(
              (config.pGrid.pMax - config.pGrid.pMin) / config.pGrid.pStep +
                0.5,
            ) + 1,
          )
        : 0;
    const total = nCount * pCount;

    const postProgress = (completed: number) => {
      const resp: WorkerResponse = {
        type: "progress",
        progress: {
          stage: "running",
          completed,
          total,
          message: `Simulating ${completed}/${total}`,
        },
      };
      self.postMessage(resp);
    };

    postProgress(0);

    const { results, best } = gridSearch(params, config, (completed) => {
      // throttle progress a bit to reduce message spam
      if (completed % 3 === 0 || completed === total) postProgress(completed);
    });

    const done: WorkerResponse = {
      type: "result",
      results,
      best,
      progress: {
        stage: "done",
        completed: total,
        total,
        message: "Done",
      },
    };

    self.postMessage(done);
  } catch (e: unknown) {
    const err: WorkerResponse = {
      type: "error",
      error: errorMessage(e),
      progress: { stage: "error", completed: 0, total: 0, message: "Error" },
    };
    self.postMessage(err);
  }
};
