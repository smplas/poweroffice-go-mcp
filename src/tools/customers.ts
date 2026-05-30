import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PowerOfficeClient, encodePath } from "../api/client.js";
import type { Customer } from "../api/types.js";

const CUSTOMER_ID = z.number().int().positive();

// Norwegian organisation number is 9 digits (with optional MVA suffix).
const ORG_NUMBER = z
  .string()
  .regex(/^\d{9}(\s?MVA)?$/)
  .describe("Norwegian organisation number (9 digits, optionally followed by 'MVA')");

const EMAIL = z.string().email().max(254);
const URL_STR = z.string().url().max(2048);

export function registerCustomerTools(server: McpServer, client: PowerOfficeClient) {
  server.tool(
    "list_customers",
    "List customers from PowerOffice Go. All customers are fetched once and then paginated client-side. By default, archived customers are excluded.",
    {
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(100).default(25).describe("Results per page (max 100)"),
      includeArchived: z.boolean().default(false).describe("Include archived customers"),
    },
    async ({ page, pageSize, includeArchived }) => {
      const all = await client.get<Customer[]>("/Customers");
      const filtered = includeArchived ? all : all.filter((c) => !c.IsArchived);
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
    "get_customer",
    "Get a single customer by ID from PowerOffice Go.",
    {
      customerId: CUSTOMER_ID.describe("The customer ID"),
    },
    async ({ customerId }) => {
      const customer = await client.get<Customer>(encodePath`/Customers/${customerId}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(customer, null, 2) }],
      };
    }
  );

  server.tool(
    "create_customer",
    "Create a new customer in PowerOffice Go. At minimum a Name is required. The default InvoiceDeliveryType is 'Print' so no email address is required; set invoiceDeliveryType to 'PdfByEmail' (and provide invoiceEmailAddress) to deliver invoices by email.",
    {
      name: z.string().min(1).max(120).describe("Display name of the customer"),
      legalName: z.string().max(120).optional().describe("Legal/registered name (e.g. 'Acme AS')"),
      organizationNumber: ORG_NUMBER.optional(),
      isPerson: z.boolean().default(false).describe("True for individuals, false for companies"),
      firstName: z.string().max(60).optional().describe("First name (for individuals)"),
      lastName: z.string().max(60).optional().describe("Last name (for individuals)"),
      emailAddress: EMAIL.optional().describe("General contact email"),
      invoiceEmailAddress: EMAIL.optional().describe(
        "Email for invoice delivery (required when invoiceDeliveryType is PdfByEmail)"
      ),
      phoneNumber: z.string().max(40).optional().describe("Phone number"),
      websiteUrl: URL_STR.optional().describe("Website URL"),
      currencyCode: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("NOK")
        .describe("ISO 4217 currency code (default NOK)"),
      paymentTerm: z.number().int().min(0).max(365).optional().describe("Payment term in days (e.g. 14)"),
      invoiceDeliveryType: z
        .enum(["Print", "PdfByEmail", "Ehf", "Vipps"])
        .default("Print")
        .describe("How invoices are delivered. Default 'Print' so no email is required."),
      address: z
        .object({
          addressLine1: z.string().max(120).optional(),
          addressLine2: z.string().max(120).optional(),
          zipCode: z.string().max(20).optional(),
          city: z.string().max(60).optional(),
          countryCode: z
            .string()
            .regex(/^[A-Z]{2}$/)
            .default("NO")
            .describe("ISO 3166-1 alpha-2 country code, default NO"),
        })
        .optional()
        .describe("Mailing address"),
      externalImportReference: z
        .string()
        .max(120)
        .optional()
        .describe("External reference for idempotency"),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        Name: params.name,
        IsPerson: params.isPerson,
        CurrencyCode: params.currencyCode,
        InvoiceDeliveryType: params.invoiceDeliveryType,
      };

      if (params.legalName) body.LegalName = params.legalName;
      if (params.organizationNumber) body.OrganizationNumber = params.organizationNumber;
      if (params.firstName) body.FirstName = params.firstName;
      if (params.lastName) body.LastName = params.lastName;
      if (params.emailAddress) body.EmailAddress = params.emailAddress;
      if (params.invoiceEmailAddress) body.InvoiceEmailAddress = params.invoiceEmailAddress;
      if (params.phoneNumber) body.PhoneNumber = params.phoneNumber;
      if (params.websiteUrl) body.WebsiteUrl = params.websiteUrl;
      if (params.paymentTerm !== undefined) body.PaymentTerm = params.paymentTerm;
      if (params.externalImportReference) body.ExternalImportReference = params.externalImportReference;

      if (params.address) {
        body.MailAddress = {
          AddressLine1: params.address.addressLine1,
          AddressLine2: params.address.addressLine2,
          ZipCode: params.address.zipCode,
          City: params.address.city,
          CountryCode: params.address.countryCode,
        };
      }

      const created = await client.post<Customer>("/Customers", body);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Customer created.\n\n` +
              `ID: ${created.Id}\n` +
              `Name: ${created.Name}\n` +
              `Number: ${created.Number ?? "(auto-assigned later)"}\n` +
              `Org.: ${created.OrganizationNumber ?? "—"}\n\n` +
              `Full response:\n${JSON.stringify(created, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "create_contact_person",
    "Add a contact person (e.g. billing contact, sales contact) to an existing customer.",
    {
      customerId: CUSTOMER_ID.describe("The customer ID to attach this contact to"),
      firstName: z.string().min(1).max(60).describe("First name"),
      lastName: z.string().max(60).optional().describe("Last name"),
      email: EMAIL.optional().describe("Email address"),
      phoneNumber: z.string().max(40).optional().describe("Phone number"),
      title: z.string().max(80).optional().describe("Job title or role"),
    },
    async (params) => {
      const body: Record<string, unknown> = { FirstName: params.firstName };
      if (params.lastName) body.LastName = params.lastName;
      if (params.email) body.EmailAddress = params.email;
      if (params.phoneNumber) body.PhoneNumber = params.phoneNumber;
      if (params.title) body.JobTitle = params.title;

      const created = await client.post<unknown>(
        encodePath`/ContactPersons/${params.customerId}`,
        body
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Contact person added to customer ${params.customerId}.\n\n${JSON.stringify(
              created,
              null,
              2
            )}`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_contact_persons",
    "List contact persons across all customers, or filter by customer.",
    {
      customerId: CUSTOMER_ID.optional().describe("Filter to a single customer"),
    },
    async ({ customerId }) => {
      const all = (await client.get<any[]>("/ContactPersons")) ?? [];
      const filtered =
        customerId !== undefined
          ? all.filter((p) => p.ContactId === customerId || p.CustomerId === customerId)
          : all;
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
    "search_customers",
    "Search customers by name or customer number in PowerOffice Go.",
    {
      query: z.string().min(1).max(120).describe("Search term — matches against customer name or number"),
      pageSize: z.number().int().min(1).max(100).default(25).describe("Max results"),
    },
    async ({ query, pageSize }) => {
      const all = await client.get<Customer[]>("/Customers");
      const q = query.toLowerCase();
      const matches = all
        .filter(
          (c) =>
            (c.Name && c.Name.toLowerCase().includes(q)) ||
            (c.Number !== undefined && c.Number !== null && String(c.Number).includes(q))
        )
        .slice(0, pageSize);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ totalMatches: matches.length, data: matches }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "archive_customer",
    "Archive a customer in PowerOffice Go (soft delete — the record is kept but hidden from default lists). Pass restore=true to un-archive.",
    {
      customerId: CUSTOMER_ID.describe("The customer ID to archive"),
      restore: z.boolean().default(false).describe("If true, un-archive (restore) the customer instead"),
    },
    async ({ customerId, restore }) => {
      const updated = await client.patch<Customer>(encodePath`/Customers/${customerId}`, {
        IsArchived: !restore,
      });
      const action = restore ? "restored" : "archived";
      return {
        content: [
          {
            type: "text" as const,
            text: `Customer ${customerId} ${action}.\n\n${JSON.stringify(updated, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "delete_customer",
    "Hard-delete a customer from PowerOffice Go. PowerOffice will reject this if the customer has any linked history (invoices, transactions, etc.) — use archive_customer in that case.",
    {
      customerId: CUSTOMER_ID.describe("The customer ID to permanently delete"),
    },
    async ({ customerId }) => {
      await client.delete<void>(encodePath`/Customers/${customerId}`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Customer ${customerId} deleted.`,
          },
        ],
      };
    }
  );
}
