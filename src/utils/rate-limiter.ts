/**
 * Token-bucket rate limiter.
 *
 * Defaults to 10 requests/second to match PowerOffice Go v2 API limits.
 *
 * Acquires are serialised through an internal queue so concurrent callers
 * cannot collectively drain the bucket below zero, and we re-check the token
 * count after each wait to handle timer skew correctly.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRateMs: number; // ms per token
  private chain: Promise<void> = Promise.resolve();

  constructor(requestsPerSecond = 10) {
    this.maxTokens = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.refillRateMs = 1000 / requestsPerSecond;
    this.lastRefill = Date.now();
  }

  acquire(): Promise<void> {
    // Serialise: each caller waits for the previous acquire to settle before
    // racing for a token. This prevents two callers both observing
    // `tokens >= 1` simultaneously and decrementing the bucket twice.
    const next = this.chain.then(() => this.acquireOne());
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async acquireOne(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Sleep just long enough for one token to become available.
      const waitMs = this.refillRateMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const newTokens = elapsed / this.refillRateMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}
