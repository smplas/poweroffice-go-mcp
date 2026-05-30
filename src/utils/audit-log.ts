import { appendFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";

/**
 * Append-only audit log of every tool invocation.
 *
 * Writes one JSON line per call to:
 *   $POWEROFFICE_AUDIT_LOG (if set)
 *   else ~/.poweroffice-mcp/audit.log
 *
 * Each line is timestamped and includes:
 *   - the tool name
 *   - the input arguments (after Zod validation)
 *   - whether the call succeeded or failed
 *   - duration in ms
 *
 * Privacy note: tool arguments may contain personal data (customer names,
 * email addresses, organization numbers, invoice line text). The log is
 * therefore created with restrictive permissions (file 0600 / dir 0700) and
 * never transmitted off-machine. Operators are responsible for retention and
 * deletion in line with their own data-handling policy.
 *
 * This file is the demonstrable evidence trail for compliance reviewers.
 */

const logPath =
  process.env.POWEROFFICE_AUDIT_LOG ||
  `${homedir()}/.poweroffice-mcp/audit.log`;

let logReady = false;
function ensureLogDir() {
  if (logReady) return;
  try {
    const dir = dirname(logPath);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Pre-create the file with restrictive permissions if it doesn't exist
    // so the first write doesn't fall back to umask-default mode.
    if (!existsSync(logPath)) {
      appendFileSync(logPath, "", { mode: 0o600 });
    }
    chmodSync(logPath, 0o600);
    logReady = true;
  } catch {
    // best effort — never break the tool because logging failed
  }
}

export function logToolCall(entry: {
  tool: string;
  args: unknown;
  status: "ok" | "error";
  durationMs: number;
  errorMessage?: string;
}): void {
  ensureLogDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  try {
    appendFileSync(logPath, line + "\n", "utf8");
  } catch {
    // never break user workflow because the log write failed
  }
  // Also emit to stderr so it's visible in the MCP host's debug output.
  process.stderr.write(`[audit] ${line}\n`);
}

/**
 * Wrap a tool handler so every call is logged.
 */
export function withAudit<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  handler: T
): T {
  return (async (...args: any[]) => {
    const start = Date.now();
    try {
      const result = await handler(...args);
      logToolCall({
        tool: toolName,
        args: args[0],
        status: "ok",
        durationMs: Date.now() - start,
      });
      return result;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logToolCall({
        tool: toolName,
        args: args[0],
        status: "error",
        durationMs: Date.now() - start,
        errorMessage,
      });
      throw e;
    }
  }) as T;
}
