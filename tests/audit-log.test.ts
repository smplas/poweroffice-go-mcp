import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("audit-log", () => {
  let tmpDir: string;
  let logFile: string;
  let withAudit: typeof import("../src/utils/audit-log.js")["withAudit"];

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pogo-audit-"));
    logFile = join(tmpDir, "audit.log");
    process.env.POWEROFFICE_AUDIT_LOG = logFile;
    // Reset module cache so `logPath` is recomputed from the env var and the
    // module-level `logReady` flag starts fresh per test.
    vi.resetModules();
    const mod = await import("../src/utils/audit-log.js");
    withAudit = mod.withAudit;
  });

  afterEach(() => {
    delete process.env.POWEROFFICE_AUDIT_LOG;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes one JSON line per successful call", async () => {
    const fn = withAudit("list_customers", async (_args: unknown) => "ok");
    await fn({ page: 1 });
    const content = readFileSync(logFile, "utf8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.tool).toBe("list_customers");
    expect(parsed.status).toBe("ok");
    expect(parsed.args).toEqual({ page: 1 });
    expect(typeof parsed.durationMs).toBe("number");
    expect(typeof parsed.ts).toBe("string");
  });

  it("writes a line for failed calls and rethrows", async () => {
    const fn = withAudit("get_invoice", async () => {
      throw new Error("boom");
    });
    await expect(fn({ invoiceId: "x" })).rejects.toThrow("boom");
    const content = readFileSync(logFile, "utf8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe("error");
    expect(parsed.errorMessage).toBe("boom");
  });

  it("creates the log file with restrictive permissions", async () => {
    const fn = withAudit("noop", async () => null);
    await fn({});
    expect(existsSync(logFile)).toBe(true);
    const mode = statSync(logFile).mode & 0o777;
    // 0o600 on Unix. Skip the assertion on Windows where mode semantics differ.
    if (process.platform !== "win32") {
      expect(mode).toBe(0o600);
    }
  });

  it("appends multiple invocations rather than overwriting", async () => {
    const fn = withAudit("ping", async () => "pong");
    await fn({ n: 1 });
    await fn({ n: 2 });
    await fn({ n: 3 });
    const lines = readFileSync(logFile, "utf8").trim().split("\n");
    expect(lines.length).toBe(3);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed.map((p) => p.args.n)).toEqual([1, 2, 3]);
  });
});
