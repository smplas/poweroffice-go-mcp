import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  it("permits up to its capacity instantly", async () => {
    const rl = new RateLimiter(10);
    const start = Date.now();
    await Promise.all(Array.from({ length: 10 }, () => rl.acquire()));
    const elapsed = Date.now() - start;
    // 10 acquires within capacity should be effectively immediate.
    expect(elapsed).toBeLessThan(50);
  });

  it("throttles requests beyond capacity", async () => {
    const rl = new RateLimiter(10); // 1 token / 100ms
    const start = Date.now();
    // 12 calls — the last 2 must wait for refill.
    await Promise.all(Array.from({ length: 12 }, () => rl.acquire()));
    const elapsed = Date.now() - start;
    // Two additional tokens require ~200ms of wall time. Allow generous slack
    // to account for timer drift on CI runners.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it(
    "serialises concurrent acquires so the bucket never goes negative",
    async () => {
      // 20 concurrent callers on a 10/s bucket. We can't directly inspect
      // token count, but if any caller resolved when the bucket was negative
      // the total elapsed time would be impossibly short.
      const capacity = 10;
      const rl = new RateLimiter(capacity);
      const total = 20;
      const start = Date.now();
      await Promise.all(Array.from({ length: total }, () => rl.acquire()));
      const elapsed = Date.now() - start;
      // After consuming the initial capacity, the remaining (total - capacity)
      // tokens must be refilled at the configured rate. Allow generous slack.
      const minExpected = ((total - capacity) * 1000) / capacity - 300;
      expect(elapsed).toBeGreaterThanOrEqual(minExpected);
    },
    10_000
  );
});
