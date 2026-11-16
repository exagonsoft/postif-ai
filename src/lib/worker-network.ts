import { AsyncLocalStorage } from "node:async_hooks";
import { deadlineSignal } from "./worker-budget";

const requestDeadline = new AsyncLocalStorage<number>();
export function getWorkerDeadline() { return requestDeadline.getStore(); }
export function withWorkerDeadline<T>(deadline: number, callback: () => Promise<T>) {
  return requestDeadline.run(deadline, callback);
}
export function workerFetch(input: string | URL | Request, init: RequestInit = {}) {
  const deadline = requestDeadline.getStore();
  if (deadline === undefined) return fetch(input, init);
  const budget = deadlineSignal(deadline);
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, budget]) : budget });
}
