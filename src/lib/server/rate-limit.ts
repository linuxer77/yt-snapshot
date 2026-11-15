type RateState = {
  count: number;
  resetAt: number;
};

const MAX_TRACKED_KEYS = 5000;

const globalForRate = globalThis as typeof globalThis & {
  __ytSnapshotRateState?: Map<string, RateState>;
};
const rateState = (globalForRate.__ytSnapshotRateState ??= new Map());

function pruneExpired(now: number) {
  for (const [key, state] of rateState) {
    if (now >= state.resetAt) {
      rateState.delete(key);
    }
  }
}

/** Fixed-window, in-memory rate limiter. Good enough for a single process. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  if (!key) {
    return { allowed: true, retryAfter: 0 };
  }

  const now = Date.now();
  if (rateState.size > MAX_TRACKED_KEYS) {
    pruneExpired(now);
  }

  const existing = rateState.get(key);
  if (!existing || now >= existing.resetAt) {
    rateState.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}
