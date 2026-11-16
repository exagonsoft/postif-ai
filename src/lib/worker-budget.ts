export interface WorkerOptions { deadline?: number; limit?: number }
export function hasTime(deadline = Infinity, minimumMs = 1000) { return Date.now() + minimumMs < deadline; }
export function deadlineSignal(deadline = Date.now() + 20000, maximumMs = 20000) {
  return AbortSignal.timeout(Math.max(1, Math.floor(Math.min(maximumMs, deadline - Date.now()))));
}
export function workerBudgetMs(value = process.env.WORKER_BUDGET_MS) {
  const parsed = Number(value || 24000);
  return Number.isFinite(parsed) ? Math.min(25000, Math.max(5000, Math.floor(parsed))) : 24000;
}
