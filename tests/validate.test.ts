import { describe, it, expect } from "vitest";
import { validateSalesOrder } from "../src/tools/validate.js";

describe("validateSalesOrder", () => {
  it("flags missing customerId as an error", () => {
    const issues = validateSalesOrder({
      salesOrderLines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(issues.some((i) => i.severity === "error" && i.field === "customerId")).toBe(true);
  });

  it("flags an empty line array as an error", () => {
    const issues = validateSalesOrder({ customerId: 1, salesOrderLines: [] });
    expect(
      issues.some((i) => i.severity === "error" && i.field === "salesOrderLines")
    ).toBe(true);
  });

  it("flags zero quantity as an error", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      salesOrderLines: [{ quantity: 0, unitPrice: 100 }],
    });
    expect(issues.some((i) => i.severity === "error" && i.field === "lines[0].quantity")).toBe(
      true
    );
  });

  it("flags missing unitPrice as an error", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      salesOrderLines: [{ quantity: 1, unitPrice: undefined as unknown as number }],
    });
    expect(
      issues.some((i) => i.severity === "error" && i.field === "lines[0].unitPrice")
    ).toBe(true);
  });

  it("warns when a line has no description and no product reference", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      salesOrderLines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(issues.some((i) => i.severity === "warning" && i.field === "lines[0]")).toBe(true);
  });

  it("warns when lines are duplicated", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      salesOrderLines: [
        { quantity: 1, unitPrice: 100, productCode: "X" },
        { quantity: 1, unitPrice: 100, productCode: "X" },
      ],
    });
    expect(issues.some((i) => i.field === "lines[1]" && /duplicate/i.test(i.message))).toBe(true);
  });

  it("warns when reported net amount disagrees with computed total", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      netAmount: 999,
      salesOrderLines: [
        { quantity: 2, unitPrice: 100, vatCode: "3", description: "test" },
      ],
    });
    // 2 * 100 = 200, reported 999 → mismatch.
    expect(issues.some((i) => i.field === "netAmount")).toBe(true);
  });

  it("accepts discountPercent and adjusts the computed total accordingly", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      netAmount: 90,
      salesOrderLines: [
        {
          quantity: 1,
          unitPrice: 100,
          discountPercent: 10,
          vatCode: "3",
          description: "x",
        },
      ],
    });
    // 100 * 0.9 = 90 → no mismatch.
    expect(issues.some((i) => i.field === "netAmount")).toBe(false);
  });

  it("returns no errors and no warnings for a well-formed order", () => {
    const issues = validateSalesOrder({
      customerId: 1,
      orderDate: "2026-06-04",
      yourReference: "PO-123",
      netAmount: 200,
      salesOrderLines: [
        {
          quantity: 2,
          unitPrice: 100,
          description: "Consulting",
          vatCode: "3",
        },
      ],
    });
    expect(issues).toEqual([]);
  });
});
