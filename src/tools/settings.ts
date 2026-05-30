import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerOfficeClient } from "../api/client.js";

export function registerSettingsTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_vat_codes",
    "List VAT codes available in PowerOffice Go (e.g. '3' = 25% MVA). Use to find the correct vatCode for invoice lines.",
    {},
    async () => {
      const data = (await client.get<unknown[]>("/VatCodes")) ?? [];
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
    "list_payment_terms",
    "List payment terms configured in PowerOffice Go (e.g. net 14, net 30).",
    {},
    async () => {
      const data = (await client.get<unknown[]>("/PaymentTerms")) ?? [];
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
    "list_branding_themes",
    "List branding themes (invoice templates) configured in PowerOffice Go.",
    {},
    async () => {
      const data = (await client.get<unknown[]>("/BrandingThemes")) ?? [];
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
    "list_currencies",
    "List currencies active in PowerOffice Go.",
    {},
    async () => {
      const data = (await client.get<unknown[]>("/Currencies")) ?? [];
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
