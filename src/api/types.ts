// PowerOffice Go API type definitions.
//
// These interfaces describe the JSON shapes returned by PowerOffice Go v2.
// Field names use PascalCase to match the API exactly. Most tools cast
// responses to `any` for forward-compatibility with new fields; these
// interfaces are kept as documentation and for typed call sites.

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Address {
  AddressLine1?: string | null;
  AddressLine2?: string | null;
  City?: string | null;
  ZipCode?: string | null;
  CountryCode?: string | null;
}

export interface Customer {
  Id: number;
  Number?: number | null;
  Name: string;
  LegalName?: string | null;
  OrganizationNumber?: string | null;
  EmailAddress?: string | null;
  InvoiceEmailAddress?: string | null;
  PhoneNumber?: string | null;
  WebsiteUrl?: string | null;
  IsArchived?: boolean;
  IsPerson?: boolean;
  CurrencyCode?: string | null;
  PaymentTerm?: number | null;
  InvoiceDeliveryType?: string | null;
  MailAddress?: Address | null;
}

export interface Product {
  Id: number;
  Code: string;
  Name: string;
  Description?: string | null;
  ProductType?: string;
  UnitOfMeasureCode?: string;
  UnitPrice?: number | null;
  UnitCost?: number | null;
  IsArchived?: boolean;
  IsStockItem?: boolean;
  ProductGroupCode?: string | null;
  ProductGroupId?: number | null;
}

export interface SalesOrderLine {
  Id?: string;
  LineType?: string;
  ProductCode?: string | null;
  ProductId?: number | null;
  Description?: string | null;
  Quantity: number;
  ProductUnitPrice: number;
  Allowance?: number | null;
  NetAmount?: number;
  SortOrder?: number;
}

export interface SalesOrder {
  Id: string;
  CustomerId: number;
  CustomerNo?: number;
  SalesOrderStatus?: SalesOrderStatus;
  CurrencyCode?: string | null;
  SalesOrderDate?: string | null;
  DeliveryDate?: string | null;
  CustomerReference?: string | null;
  ExternalImportReference?: string | null;
  SalesOrderLines?: SalesOrderLine[];
  NetAmount?: number;
  LineCount?: number;
  CreatedDateTimeOffset?: string;
  LastChangedDateTimeOffset?: string;
}

// Sales order status as exposed by PowerOffice Go v2. The API returns the
// string form (e.g. "Draft", "Confirmed") on responses.
export type SalesOrderStatus = "Draft" | "Confirmed";
