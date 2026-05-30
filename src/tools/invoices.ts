import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";
import type { SalesOrder } from "../api/types.js";

// PowerOffice sales-order line types. Only "Normal" is exposed here; other
// types (Text/Summary/InvoiceFee/TotalHours) would require additional
// validation and are intentionally not surfaced as a user choice.
const LINE_TYPE_NORMAL = "Normal";

// PowerOffice sales-order GUID format (per /SalesOrders/Complete response).
const SALES_ORDER_ID = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .describe("Sales order ID (GUID)");

// Attachment safety: optional directory the user must allowlist for file
// uploads. Without this set the tool refuses to read files.
const ATTACHMENT_DIR = process.env.POWEROFFICE_ATTACHMENT_DIR;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_ATTACHMENT_EXTS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".csv",
  ".docx",
  ".xlsx",
]);

const SalesOrderLineSchema = z.object({
  productCode: z.string().max(40).optional().describe("Product code"),
  productId: z.number().int().positive().optional().describe("Product ID"),
  description: z.string().max(500).optional().describe("Line description"),
  quantity: z.number().describe("Quantity"),
  unitPrice: z.number().describe("Unit price (excl. VAT)"),
  discountPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Discount percentage 0-100"),
  vatCode: z.string().max(10).optional().describe("VAT code (e.g. '3' for 25% MVA)"),
  sortOrder: z.number().int().optional().describe("Sort order"),
});

export function registerInvoiceTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_invoices",
    "List sales orders (invoices) from PowerOffice Go in a given date range. Both fromDate and toDate are required by the upstream API. Results are paginated client-side and may be filtered by status.",
    {
      fromDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Required. Earliest order date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Required. Latest order date (YYYY-MM-DD)"),
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(100).default(25).describe("Results per page"),
      status: z
        .enum(["draft", "confirmed", "all"])
        .default("all")
        .describe("Filter by sales order status"),
    },
    async ({ page, pageSize, status, fromDate, toDate }) => {
      const response = await client.get<SalesOrder[] | undefined>("/SalesOrders", {
        fromDate,
        toDate,
      });

      const all: SalesOrder[] = Array.isArray(response) ? response : [];
      const wanted =
        status === "draft" ? "Draft" : status === "confirmed" ? "Confirmed" : null;
      const filtered = wanted === null ? all : all.filter((o) => o.SalesOrderStatus === wanted);

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
    "get_invoice",
    "Get a single sales order (invoice) by ID from PowerOffice Go.",
    {
      invoiceId: SALES_ORDER_ID,
    },
    async ({ invoiceId }) => {
      const order = await client.get<SalesOrder>(encodePath`/SalesOrders/${invoiceId}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(order, null, 2) }],
      };
    }
  );

  server.tool(
    "create_draft_invoice",
    "Create a new DRAFT sales order (invoice) in PowerOffice Go via POST /SalesOrders/Complete. The invoice will NOT be sent — it must be reviewed and approved by a human in the PowerOffice Go UI.",
    {
      customerId: z.number().int().positive().describe("Customer ID"),
      orderDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Order date (YYYY-MM-DD). Defaults to today on the server."),
      deliveryDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Delivery date (YYYY-MM-DD)"),
      yourReference: z.string().max(120).optional().describe("Customer's reference"),
      ourReferenceEmployeeCode: z
        .number()
        .int()
        .optional()
        .describe("Our reference employee code"),
      externalImportReference: z
        .string()
        .max(120)
        .optional()
        .describe("External reference for idempotency"),
      currencyCode: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("NOK")
        .describe("ISO 4217 currency code (default NOK)"),
      projectId: z.number().int().positive().optional().describe("Link the invoice to a project"),
      projectCode: z.string().max(40).optional().describe("Link the invoice to a project by code"),
      departmentId: z.number().int().positive().optional().describe("Tag with department"),
      departmentCode: z.string().max(40).optional().describe("Tag with department by code"),
      lines: z.array(SalesOrderLineSchema).min(1).describe("Invoice lines (at least one required)"),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        CustomerId: params.customerId,
        SalesOrderStatus: "Draft",
        CurrencyCode: params.currencyCode,
        SalesOrderLines: params.lines.map((line) => {
          const apiLine: Record<string, unknown> = {
            LineType: LINE_TYPE_NORMAL,
            Quantity: line.quantity,
            ProductUnitPrice: line.unitPrice,
          };
          if (line.productCode) apiLine.ProductCode = line.productCode;
          if (line.productId) apiLine.ProductId = line.productId;
          if (line.description) apiLine.Description = line.description;
          // PowerOffice uses "Allowance" for the line discount percentage.
          if (line.discountPercent !== undefined) apiLine.Allowance = line.discountPercent;
          if (line.sortOrder !== undefined) apiLine.SortOrder = line.sortOrder;
          if (line.vatCode) apiLine.VatCode = line.vatCode;
          return apiLine;
        }),
      };

      if (params.orderDate) body.SalesOrderDate = params.orderDate;
      if (params.deliveryDate) body.DeliveryDate = params.deliveryDate;
      if (params.yourReference) body.CustomerReference = params.yourReference;
      if (params.ourReferenceEmployeeCode)
        body.SalesPersonEmployeeNumber = params.ourReferenceEmployeeCode;
      if (params.externalImportReference)
        body.ExternalImportReference = params.externalImportReference;
      if (params.projectId) body.ProjectId = params.projectId;
      if (params.projectCode) body.ProjectCode = params.projectCode;
      if (params.departmentId) body.DepartmentId = params.departmentId;
      if (params.departmentCode) body.DepartmentCode = params.departmentCode;

      const order = await client.post<SalesOrder>("/SalesOrders/Complete", body);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Draft invoice created.\n\n` +
              `ID: ${order.Id}\n` +
              `Customer: ${order.CustomerId} (#${order.CustomerNo})\n` +
              `Net amount: ${order.NetAmount} ${order.CurrencyCode || params.currencyCode}\n` +
              `Lines: ${order.LineCount}\n\n` +
              `Full response:\n${JSON.stringify(order, null, 2)}\n\n` +
              `This invoice is a DRAFT. A human must review and send it from the PowerOffice Go UI.`,
          },
        ],
      };
    }
  );

  server.tool(
    "delete_draft_invoice",
    "Delete a DRAFT sales order in PowerOffice Go. Only drafts can be deleted; PowerOffice rejects deletion of confirmed or invoiced orders.",
    {
      invoiceId: SALES_ORDER_ID,
    },
    async ({ invoiceId }) => {
      await client.delete<void>(encodePath`/SalesOrders/${invoiceId}`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Draft invoice ${invoiceId} deleted.`,
          },
        ],
      };
    }
  );

  server.tool(
    "add_invoice_attachment",
    "Attach a local file (PDF, image, etc.) to a draft sales order. Requires the POWEROFFICE_ATTACHMENT_DIR environment variable to be set; only files whose canonical path is inside that directory may be attached. Files larger than 10 MB or with extensions outside an allowlist are rejected.",
    {
      invoiceId: SALES_ORDER_ID,
      filePath: z
        .string()
        .max(1024)
        .describe(
          "Path to the file. Must resolve inside POWEROFFICE_ATTACHMENT_DIR."
        ),
      description: z.string().max(500).optional().describe("Optional description"),
    },
    async ({ invoiceId, filePath, description }) => {
      if (!ATTACHMENT_DIR) {
        throw new Error(
          "add_invoice_attachment: POWEROFFICE_ATTACHMENT_DIR is not set. " +
            "The operator must allowlist a directory before attachments can be uploaded."
        );
      }

      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const allowedRoot = await fs.realpath(path.resolve(ATTACHMENT_DIR));
      const resolved = await fs.realpath(path.resolve(filePath));
      if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
        throw new Error(
          `add_invoice_attachment: refused to read a file outside the allowlisted directory.`
        );
      }

      const ext = path.extname(resolved).toLowerCase();
      if (!ALLOWED_ATTACHMENT_EXTS.has(ext)) {
        throw new Error(
          `add_invoice_attachment: file extension "${ext}" is not on the allowlist.`
        );
      }

      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        throw new Error(`add_invoice_attachment: path is not a regular file.`);
      }
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(
          `add_invoice_attachment: file exceeds maximum size of ${MAX_ATTACHMENT_BYTES} bytes.`
        );
      }

      const data = await fs.readFile(resolved);
      const filename = path.basename(resolved);

      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(data)]), filename);
      if (description) form.append("description", description);

      const result = await client.upload<unknown>(
        encodePath`/SalesOrders/${invoiceId}/attachments`,
        form
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Attachment "${filename}" added to invoice ${invoiceId}.\n\n${JSON.stringify(
              result,
              null,
              2
            )}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_draft_invoice",
    "Update an existing DRAFT sales order (invoice) in PowerOffice Go. Only draft invoices can be updated.",
    {
      invoiceId: SALES_ORDER_ID,
      customerId: z.number().int().positive().optional().describe("New customer ID"),
      orderDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("New order date (YYYY-MM-DD)"),
      deliveryDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("New delivery date (YYYY-MM-DD)"),
      yourReference: z.string().max(120).optional().describe("Customer's reference"),
      lines: z.array(SalesOrderLineSchema).optional().describe("Replace all invoice lines"),
    },
    async ({ invoiceId, ...updates }) => {
      // PowerOffice expects PascalCase field names for PATCH paths (RFC 6902).
      const body: Record<string, unknown> = {};
      if (updates.customerId !== undefined) body.CustomerId = updates.customerId;
      if (updates.orderDate !== undefined) body.SalesOrderDate = updates.orderDate;
      if (updates.deliveryDate !== undefined) body.DeliveryDate = updates.deliveryDate;
      if (updates.yourReference !== undefined) body.CustomerReference = updates.yourReference;
      if (updates.lines !== undefined) {
        body.SalesOrderLines = updates.lines.map((line) => {
          const apiLine: Record<string, unknown> = {
            LineType: LINE_TYPE_NORMAL,
            Quantity: line.quantity,
            ProductUnitPrice: line.unitPrice,
          };
          if (line.productCode) apiLine.ProductCode = line.productCode;
          if (line.productId) apiLine.ProductId = line.productId;
          if (line.description) apiLine.Description = line.description;
          if (line.discountPercent !== undefined) apiLine.Allowance = line.discountPercent;
          if (line.sortOrder !== undefined) apiLine.SortOrder = line.sortOrder;
          if (line.vatCode) apiLine.VatCode = line.vatCode;
          return apiLine;
        });
      }

      const order = await client.patch<SalesOrder>(
        encodePath`/SalesOrders/${invoiceId}`,
        body
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Draft invoice updated.\n\n${JSON.stringify(order, null, 2)}`,
          },
        ],
      };
    }
  );
}
