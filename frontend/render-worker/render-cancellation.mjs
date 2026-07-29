const activeRenders = new Map();
const cancellationRequests = new Map();
const CANCELLATION_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_CANCELLATIONS = 1024;

function pruneCancellationRequests() {
  const cutoff = Date.now() - CANCELLATION_TTL_MS;
  for (const [taskId, requestedAt] of cancellationRequests) {
    if (requestedAt >= cutoff) break;
    cancellationRequests.delete(taskId);
  }
  while (cancellationRequests.size >= MAX_PENDING_CANCELLATIONS) {
    cancellationRequests.delete(cancellationRequests.keys().next().value);
  }
}

export function registerActiveRender(taskId, cancel) {
  if (cancellationRequests.has(taskId)) {
    cancel();
    return;
  }
  activeRenders.set(taskId, cancel);
}

export function unregisterActiveRender(taskId) {
  activeRenders.delete(taskId);
  cancellationRequests.delete(taskId);
}

export function cancelActiveRender(taskId) {
  const cancel = activeRenders.get(taskId);
  if (cancel) {
    activeRenders.delete(taskId);
    cancellationRequests.set(taskId, Date.now());
    cancel();
    return true;
  }
  if (cancellationRequests.has(taskId)) return false;
  pruneCancellationRequests();
  cancellationRequests.set(taskId, Date.now());
  return true;
}
