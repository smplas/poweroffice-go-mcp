import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PowerOfficeClient, type PowerOfficeConfig } from "./api/client.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerProductTools } from "./tools/products.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerValidationTools } from "./tools/validate.js";
import { registerOutgoingInvoiceTools } from "./tools/outgoing-invoices.js";
import { registerLedgerTools } from "./tools/ledger.js";
import { registerEmployeeTools } from "./tools/employees.js";
import { registerDimensionTools } from "./tools/dimensions.js";
import { registerSettingsTools } from "./tools/settings.js";
import { registerProspectTools } from "./tools/prospects.js";
import { withAudit } from "./utils/audit-log.js";

export function createServer(config: PowerOfficeConfig): McpServer {
  const server = new McpServer({
    name: "poweroffice-go",
    version: "0.3.0",
  });

  // Wrap server.tool so every registered handler is automatically audit-logged.
  // Every invocation is appended (timestamp + tool + args + outcome + duration)
  // to ~/.poweroffice-mcp/audit.log (configurable via POWEROFFICE_AUDIT_LOG).
  const originalTool = server.tool.bind(server) as any;
  (server as any).tool = (...registerArgs: any[]) => {
    const toolName = registerArgs[0] as string;
    // The handler is always the last argument.
    const handler = registerArgs[registerArgs.length - 1];
    if (typeof handler === "function") {
      registerArgs[registerArgs.length - 1] = withAudit(toolName, handler);
    }
    return originalTool(...registerArgs);
  };

  const client = new PowerOfficeClient(config);

  registerCustomerTools(server, client);
  registerProductTools(server, client);
  registerInvoiceTools(server, client);
  registerValidationTools(server, client);
  registerOutgoingInvoiceTools(server, client);
  registerLedgerTools(server, client);
  registerEmployeeTools(server, client);
  registerDimensionTools(server, client);
  registerSettingsTools(server, client);
  registerProspectTools(server, client);

  return server;
}
