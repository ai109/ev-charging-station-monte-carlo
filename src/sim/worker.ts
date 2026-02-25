// src/sim/worker.ts

import { gridSearch } from "./gridSearch";
import { type WorkerRequest, type WorkerResponse } from "./types";

// Vite Web Worker entry
self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  if (msg.type !== "run-grid") return;

  try {
    const { params, config } = msg;

    const total =
      (config.nGrid.nMax - config.nGrid.nMin + 1) *
      (Math.floor(
        (config.pGrid.pMax - config.pGrid.pMin) / config.pGrid.pStep + 0.5,
      ) +
        1);

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
  } catch (e: any) {
    const err: WorkerResponse = {
      type: "error",
      error: e?.message ?? String(e),
      progress: { stage: "error", completed: 0, total: 0, message: "Error" },
    };
    self.postMessage(err);
  }
};
