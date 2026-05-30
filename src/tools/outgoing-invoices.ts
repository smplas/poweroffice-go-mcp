import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";

export function registerOutgoingInvoiceTools(
  server: McpServer,
  client: PowerOfficeClient
) {
  server.tool(
    "list_outgoing_invoices",
    "List actual sent (outgoing) invoices from PowerOffice Go, including payment balances. Use this to see invoices that have been issued — not drafts. Results are paginated client-side.",
    {
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(100).default(25).describe("Results per page"),
      customerId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Filter to a specific customer"),
      onlyUnpaid: z
        .boolean()
        .default(false)
        .describe("Only return invoices with non-zero balance"),
      fromDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Filter by invoice date >= (YYYY-MM-DD)"),
      toDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Filter by invoice date <= (YYYY-MM-DD)"),
    },
    async ({ page, pageSize, customerId, onlyUnpaid, fromDate, toDate }) => {
      const all = (await client.get<any[]>("/OutgoingInvoices")) ?? [];
      let filtered = all;
      if (customerId !== undefined)
        filtered = filtered.filter((i) => i.CustomerId === customerId);
      if (onlyUnpaid) filtered = filtered.filter((i) => (i.Balance ?? 0) > 0);
      if (fromDate) filtered = filtered.filter((i) => i.InvoiceDate && i.InvoiceDate >= fromDate);
      if (toDate) filtered = filtered.filter((i) => i.InvoiceDate && i.InvoiceDate <= toDate);
      const start = (page - 1) * pageSize;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                page,
                pageSize,
                totalCount: filtered.length,
                data: filtered.slice(start, start + pageSize),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "get_outgoing_invoice",
    "Get a single sent (outgoing) invoice by ID, including its lines.",
    {
      invoiceId: z.string().min(1).max(64).describe("The outgoing invoice ID"),
      includeLines: z.boolean().default(true).describe("Also fetch invoice lines"),
    },
    async ({ invoiceId, includeLines }) => {
      const invoice = await client.get<unknown>(encodePath`/OutgoingInvoices/${invoiceId}`);
      let lines: unknown = null;
      if (includeLines) {
        try {
          lines = await client.get<unknown>(encodePath`/OutgoingInvoices/${invoiceId}/Lines`);
        } catch {
          lines = "(lines could not be fetched)";
        }
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ invoice, lines }, null, 2) },
        ],
      };
    }
  );
}
