import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PowerOfficeClient } from "../api/client.js";

export function registerDimensionTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_departments",
    "List departments configured in PowerOffice Go. Use the returned codes/IDs when tagging an invoice to a department.",
    {},
    async () => {
      const data = (await client.get<unknown[]>("/Departments")) ?? [];
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: data.length, data }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "create_project",
    "Create a new project in PowerOffice Go. Only `name` is required. Link to a customer via customerId for client work.",
    {
      name: z.string().min(1).max(120).describe("Project name"),
      code: z.string().max(40).optional().describe("Optional project code"),
      customerId: z.number().int().positive().optional().describe("Link to a customer"),
      isBillable: z.boolean().default(true).describe("Whether the project is billable"),
      isActive: z.boolean().default(true).describe("Whether the project is active"),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Start date (YYYY-MM-DD)"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("End date (YYYY-MM-DD)"),
      fixedPrice: z.number().optional().describe("Fixed price (if billing method is fixed price)"),
      budgetedHours: z.number().optional().describe("Budgeted hours"),
      budgetedTotalRevenue: z.number().optional().describe("Budgeted total revenue"),
      projectManagerEmployeeId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Employee ID of the project manager"),
      departmentCode: z.string().max(40).optional().describe("Department code"),
      contractNo: z.string().max(60).optional().describe("Contract number"),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        Name: params.name,
        IsBillable: params.isBillable,
        IsActive: params.isActive,
      };
      if (params.code) body.Code = params.code;
      if (params.customerId) body.CustomerId = params.customerId;
      if (params.startDate) body.StartDate = params.startDate;
      if (params.endDate) body.EndDate = params.endDate;
      if (params.fixedPrice !== undefined) body.FixedPrice = params.fixedPrice;
      if (params.budgetedHours !== undefined) body.BudgetedHours = params.budgetedHours;
      if (params.budgetedTotalRevenue !== undefined)
        body.BudgetedTotalRevenue = params.budgetedTotalRevenue;
      if (params.projectManagerEmployeeId)
        body.ProjectManagerEmployeeId = params.projectManagerEmployeeId;
      if (params.departmentCode) body.DepartmentCode = params.departmentCode;
      if (params.contractNo) body.ContractNo = params.contractNo;

      const created = await client.post<any>("/Projects", body);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Project created.\n\n` +
              `ID: ${created.Id}\n` +
              `Code: ${created.Code ?? "(auto)"}\n` +
              `Name: ${created.Name}\n` +
              `Customer: ${created.CustomerId ?? "—"}\n\n` +
              `${JSON.stringify(created, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_projects",
    "List projects configured in PowerOffice Go. Use the returned codes/IDs when tagging an invoice to a project.",
    {
      includeArchived: z.boolean().default(false).describe("Include archived projects"),
    },
    async ({ includeArchived }) => {
      const all = (await client.get<any[]>("/Projects")) ?? [];
      const data = includeArchived ? all : all.filter((p) => !p.IsArchived);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: data.length, data }, null, 2),
          },
        ],
      };
    }
  );
}
