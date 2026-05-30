import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PowerOfficeClient } from "../api/client.js";

export function registerLedgerTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "get_customer_balances",
    "Get outstanding balances per customer (customer ledger). Answers: who owes us money?",
    {
      customerId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Filter to a single customer"),
      onlyNonZero: z.boolean().default(true).describe("Hide customers with zero balance"),
    },
    async ({ customerId, onlyNonZero }) => {
      const all = (await client.get<any[]>("/Customerledger/CustomerBalances")) ?? [];
      let filtered = all;
      if (customerId !== undefined) filtered = filtered.filter((b) => b.CustomerId === customerId);
      if (onlyNonZero) filtered = filtered.filter((b) => (b.Balance ?? 0) !== 0);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: filtered.length, data: filtered }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_open_items",
    "Get unpaid/unmatched ledger items (open items) — individual invoices not yet paid.",
    {
      customerId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Filter to a single customer"),
      onlyOverdue: z.boolean().default(false).describe("Only return items past their due date"),
    },
    async ({ customerId, onlyOverdue }) => {
      const all = (await client.get<any[]>("/Customerledger/OpenItems")) ?? [];
      let filtered = all;
      if (customerId !== undefined) filtered = filtered.filter((i) => i.CustomerId === customerId);
      if (onlyOverdue) {
        // PowerOffice serialises DueDate as a YYYY-MM-DD string, so a plain
        // string comparison against today's ISO date is correct.
        const today = new Date().toISOString().split("T")[0];
        filtered = filtered.filter((i) => i.DueDate && i.DueDate < today);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: filtered.length, data: filtered }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_customer_statement",
    "Get a full ledger statement for a customer (all entries, paid and unpaid).",
    {
      customerId: z.number().int().positive().describe("The customer ID"),
      fromDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Start date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("End date (YYYY-MM-DD)"),
    },
    async ({ customerId, fromDate, toDate }) => {
      const params: Record<string, string> = { customerId: String(customerId) };
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      const result = await client.get<unknown>("/Customerledger/Statement", params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
