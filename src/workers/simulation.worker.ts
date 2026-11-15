import { RunSimulationOptions, runWealthSimulation } from '../engine/simulator';

export interface WorkerRequest {
  requestId: number;
  options: Omit<RunSimulationOptions, 'onProgress'>;
}

export type WorkerMessage =
  | { type: 'progress'; requestId: number; completed: number; total: number }
  | { type: 'result'; requestId: number; output: ReturnType<typeof runWealthSimulation> }
  | { type: 'error'; requestId: number; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, options } = event.data;
  try {
    const output = runWealthSimulation({
      ...options,
      onProgress: (completed, total) => {
        self.postMessage({
          type: 'progress',
          requestId,
          completed,
          total,
        } satisfies WorkerMessage);
      },
    });
    self.postMessage({
      type: 'result',
      requestId,
      output,
    } satisfies WorkerMessage);
  } catch (err) {
    self.postMessage({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : '시뮬레이션 실행 중 오류가 발생했습니다.',
    } satisfies WorkerMessage);
  }
};
