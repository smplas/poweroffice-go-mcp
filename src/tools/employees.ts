import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";

export function registerEmployeeTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_employees",
    "List employees from PowerOffice Go. Useful for finding employee codes/IDs (e.g. for ourReferenceEmployeeCode on invoices). By default, archived employees are excluded.",
    {
      includeArchived: z.boolean().default(false).describe("Include archived employees"),
      query: z
        .string()
        .max(120)
        .optional()
        .describe("Filter by name substring (case-insensitive)"),
    },
    async ({ includeArchived, query }) => {
      const all = (await client.get<any[]>("/Employees")) ?? [];
      let filtered = all;
      if (!includeArchived) filtered = filtered.filter((e) => !e.IsArchived);
      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter((e) => {
          const name = `${e.FirstName ?? ""} ${e.LastName ?? ""}`.toLowerCase();
          return name.includes(q);
        });
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
    "get_employee",
    "Get a single employee by ID.",
    {
      employeeId: z.number().int().positive().describe("Employee ID"),
    },
    async ({ employeeId }) => {
      const employee = await client.get<unknown>(encodePath`/Employees/${employeeId}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(employee, null, 2) }],
      };
    }
  );
}
