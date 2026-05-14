type RateState = {
  count: number;
  resetAt: number;
};

const rateState = new Map<string, RateState>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  if (!key) {
    return { allowed: true, retryAfter: 0 };
  }

  const now = Date.now();
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
