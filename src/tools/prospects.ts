import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";

export function registerProspectTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_customer_prospects",
    "List customer prospects (sales leads) from PowerOffice Go.",
    {
      query: z.string().max(120).optional().describe("Filter by name substring (case-insensitive)"),
    },
    async ({ query }) => {
      const all = (await client.get<any[]>("/CustomerProspects")) ?? [];
      let filtered = all;
      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter((p) => (p.Name ?? "").toLowerCase().includes(q));
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
    "convert_prospect_to_customer",
    "Convert a customer prospect into an active customer.",
    {
      prospectId: z.number().int().positive().describe("The prospect ID to convert"),
    },
    async ({ prospectId }) => {
      const result = await client.post<unknown>(
        encodePath`/CustomerProspects/${prospectId}/ConvertToCustomer`,
        {}
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Prospect ${prospectId} converted to customer.\n\n${JSON.stringify(
              result,
              null,
              2
            )}`,
          },
        ],
      };
    }
  );
}
