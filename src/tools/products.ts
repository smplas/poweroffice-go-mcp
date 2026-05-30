import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";
import type { Product } from "../api/types.js";

const PRODUCT_ID = z.number().int().positive();

// PowerOffice product types. Only "Product" is exposed here; the API also
// supports "Service" but we keep the surface narrow until needed.
const PRODUCT_TYPE_PRODUCT = "Product";

export function registerProductTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_products",
    "List products from PowerOffice Go. All products are fetched once and then paginated client-side. By default, archived products are excluded.",
    {
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(100).default(25).describe("Results per page (max 100)"),
      includeArchived: z.boolean().default(false).describe("Include archived products"),
    },
    async ({ page, pageSize, includeArchived }) => {
      const all = await client.get<Product[]>("/Products");
      const filtered = includeArchived ? all : all.filter((p) => !p.IsArchived);
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
    "create_product",
    "Create a new product in PowerOffice Go.",
    {
      code: z.string().min(1).max(40).describe("Product code (unique identifier you choose)"),
      name: z.string().min(1).max(120).describe("Product name"),
      description: z.string().max(500).optional().describe("Free-text description"),
      unitPrice: z.number().optional().describe("Sales price per unit (excl. VAT)"),
      unitCost: z.number().optional().describe("Cost price per unit"),
      unitOfMeasureCode: z
        .string()
        .max(10)
        .default("EA")
        .describe("Unit of measure code (e.g. EA, HUR, KGM)"),
      productGroupCode: z.string().max(40).optional().describe("Product group code"),
      isStockItem: z.boolean().default(false).describe("Whether this product is tracked in inventory"),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        Code: params.code,
        Name: params.name,
        UnitOfMeasureCode: params.unitOfMeasureCode,
        IsStockItem: params.isStockItem,
        ProductType: PRODUCT_TYPE_PRODUCT,
      };
      if (params.description) body.Description = params.description;
      if (params.unitPrice !== undefined) body.UnitPrice = params.unitPrice;
      if (params.unitCost !== undefined) body.UnitCost = params.unitCost;
      if (params.productGroupCode) body.ProductGroupCode = params.productGroupCode;

      const created = await client.post<Product>("/Products", body);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Product created.\n\n` +
              `ID: ${created.Id}\n` +
              `Code: ${created.Code}\n` +
              `Name: ${created.Name}\n\n` +
              `${JSON.stringify(created, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_product",
    "Update an existing product in PowerOffice Go.",
    {
      productId: PRODUCT_ID.describe("Product ID"),
      name: z.string().min(1).max(120).optional().describe("New product name"),
      description: z.string().max(500).optional().describe("New description"),
      unitPrice: z.number().optional().describe("New sales price (excl. VAT)"),
      unitCost: z.number().optional().describe("New cost price"),
      unitOfMeasureCode: z.string().max(10).optional().describe("New unit of measure code"),
      productGroupCode: z.string().max(40).optional().describe("New product group code"),
      isArchived: z.boolean().optional().describe("Archive (true) or restore (false)"),
    },
    async ({ productId, ...updates }) => {
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) body.Name = updates.name;
      if (updates.description !== undefined) body.Description = updates.description;
      if (updates.unitPrice !== undefined) body.UnitPrice = updates.unitPrice;
      if (updates.unitCost !== undefined) body.UnitCost = updates.unitCost;
      if (updates.unitOfMeasureCode !== undefined) body.UnitOfMeasureCode = updates.unitOfMeasureCode;
      if (updates.productGroupCode !== undefined) body.ProductGroupCode = updates.productGroupCode;
      if (updates.isArchived !== undefined) body.IsArchived = updates.isArchived;

      const updated = await client.patch<Product>(encodePath`/Products/${productId}`, body);
      return {
        content: [
          {
            type: "text" as const,
            text: `Product ${productId} updated.\n\n${JSON.stringify(updated, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_product",
    "Get a single product by ID from PowerOffice Go.",
    {
      productId: PRODUCT_ID.describe("The product ID"),
    },
    async ({ productId }) => {
      const product = await client.get<Product>(encodePath`/Products/${productId}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(product, null, 2) }],
      };
    }
  );
}
