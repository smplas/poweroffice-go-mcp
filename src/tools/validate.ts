import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";

interface ValidationIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

// Shape used internally for validation — both the live API response (which is
// PascalCase) and locally-constructed objects (which the caller may pass in
// camelCase) are normalised onto this view.
interface ValidationLine {
  productCode?: string;
  productId?: number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  vatCode?: string;
}

export interface ValidationOrder {
  customerId?: number;
  orderDate?: string;
  yourReference?: string;
  netAmount?: number;
  salesOrderLines?: ValidationLine[];
}

function fromApiSalesOrder(o: any): ValidationOrder {
  return {
    customerId: o.CustomerId ?? o.customerId,
    orderDate: o.SalesOrderDate ?? o.orderDate,
    yourReference: o.CustomerReference ?? o.yourReference,
    netAmount: o.NetAmount ?? o.netAmount,
    salesOrderLines: (o.SalesOrderLines ?? o.salesOrderLines ?? []).map((l: any) => ({
      productCode: l.ProductCode ?? l.productCode,
      productId: l.ProductId ?? l.productId,
      description: l.Description ?? l.description,
      quantity: l.Quantity ?? l.quantity,
      unitPrice: l.ProductUnitPrice ?? l.unitPrice,
      discountPercent: l.Allowance ?? l.discountPercent,
      vatCode: l.VatCode ?? l.vatCode,
    })),
  };
}

export function validateSalesOrder(order: ValidationOrder): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!order.customerId) {
    issues.push({ severity: "error", field: "customerId", message: "Customer ID is required" });
  }

  if (!order.salesOrderLines || order.salesOrderLines.length === 0) {
    issues.push({
      severity: "error",
      field: "salesOrderLines",
      message: "At least one invoice line is required",
    });
  } else {
    const lines = order.salesOrderLines;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.quantity) {
        issues.push({
          severity: "error",
          field: `lines[${i}].quantity`,
          message: `Line ${i + 1}: quantity must be non-zero`,
        });
      }
      if (line.unitPrice === undefined || line.unitPrice === null) {
        issues.push({
          severity: "error",
          field: `lines[${i}].unitPrice`,
          message: `Line ${i + 1}: unit price is required`,
        });
      }
      if (!line.description && !line.productCode && !line.productId) {
        issues.push({
          severity: "warning",
          field: `lines[${i}]`,
          message: `Line ${i + 1}: has no description or product reference`,
        });
      }
      if (!line.vatCode) {
        issues.push({
          severity: "warning",
          field: `lines[${i}].vatCode`,
          message: `Line ${i + 1}: no VAT code set — will use default`,
        });
      }
    }

    // Detect duplicate lines.
    const keys = lines.map(
      (l) => `${l.productCode || l.productId || ""}-${l.quantity}-${l.unitPrice}`
    );
    const seen = new Set<string>();
    for (let i = 0; i < keys.length; i++) {
      if (seen.has(keys[i])) {
        issues.push({
          severity: "warning",
          field: `lines[${i}]`,
          message: `Line ${i + 1}: appears to be a duplicate of another line`,
        });
      }
      seen.add(keys[i]);
    }
  }

  if (!order.orderDate) {
    issues.push({ severity: "warning", field: "orderDate", message: "No order date set" });
  }

  if (!order.yourReference) {
    issues.push({
      severity: "warning",
      field: "yourReference",
      message: "No customer reference set",
    });
  }

  // Compare reported net amount against a computed total.
  if (order.salesOrderLines && order.salesOrderLines.length > 0) {
    const computedNet = order.salesOrderLines.reduce((sum, line) => {
      const factor = line.discountPercent ? 1 - line.discountPercent / 100 : 1;
      return sum + (line.quantity ?? 0) * (line.unitPrice ?? 0) * factor;
    }, 0);

    if (order.netAmount !== undefined && Math.abs(order.netAmount - computedNet) > 0.01) {
      issues.push({
        severity: "warning",
        field: "netAmount",
        message: `Net amount (${order.netAmount}) doesn't match computed total (${computedNet.toFixed(
          2
        )})`,
      });
    }
  }

  return issues;
}

export function registerValidationTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "validate_invoice",
    "Validate a draft invoice for completeness — checks for missing fields, VAT codes, totals, and potential duplicates. Can validate an existing invoice by ID or validate data before creating one.",
    {
      invoiceId: z
        .string()
        .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        .optional()
        .describe("Existing sales order ID (GUID) to validate"),
      invoiceData: z
        .object({
          customerId: z.number().int().positive(),
          orderDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          yourReference: z.string().max(120).optional(),
          salesOrderLines: z.array(
            z.object({
              productCode: z.string().max(40).optional(),
              productId: z.number().int().positive().optional(),
              description: z.string().max(500).optional(),
              quantity: z.number(),
              unitPrice: z.number(),
              discountPercent: z.number().min(0).max(100).optional(),
              vatCode: z.string().max(10).optional(),
            })
          ),
        })
        .optional()
        .describe("Invoice data to validate (alternative to invoiceId)"),
    },
    async ({ invoiceId, invoiceData }) => {
      let order: ValidationOrder;

      if (invoiceId) {
        const raw = await client.get<unknown>(encodePath`/SalesOrders/${invoiceId}`);
        order = fromApiSalesOrder(raw);
      } else if (invoiceData) {
        order = invoiceData;
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: provide either invoiceId or invoiceData to validate.",
            },
          ],
        };
      }

      const issues = validateSalesOrder(order);
      const errors = issues.filter((i) => i.severity === "error");
      const warnings = issues.filter((i) => i.severity === "warning");

      const lines: string[] = [
        `Validation results:`,
        `  Errors: ${errors.length}`,
        `  Warnings: ${warnings.length}`,
        ``,
      ];
      if (errors.length > 0) {
        lines.push("ERRORS (must fix):");
        for (const e of errors) lines.push(`  - [${e.field}] ${e.message}`);
        lines.push("");
      }
      if (warnings.length > 0) {
        lines.push("WARNINGS (review):");
        for (const w of warnings) lines.push(`  - [${w.field}] ${w.message}`);
        lines.push("");
      }
      if (issues.length === 0) {
        lines.push("No issues found. Invoice looks good.");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
