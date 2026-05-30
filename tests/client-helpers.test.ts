import { describe, it, expect } from "vitest";
import { encodePath, toJsonPatch } from "../src/api/client.js";

describe("encodePath", () => {
  it("URL-encodes interpolated segments", () => {
    const id = "abc def/ghi";
    expect(encodePath`/Customers/${id}`).toBe("/Customers/abc%20def%2Fghi");
  });

  it("prevents path-segment injection via slashes", () => {
    const id = "123/Confirm";
    const out = encodePath`/SalesOrders/${id}`;
    // The slash must be encoded so an attacker cannot append a new path segment.
    expect(out).toBe("/SalesOrders/123%2FConfirm");
    expect(out.indexOf("/Confirm")).toBe(-1);
  });

  it("prevents path-segment injection via dot-dot traversal", () => {
    const id = "../SuperSecret";
    const out = encodePath`/v2/Customers/${id}`;
    expect(out).toBe("/v2/Customers/..%2FSuperSecret");
  });

  it("handles non-string values via String() coercion", () => {
    expect(encodePath`/Products/${42}`).toBe("/Products/42");
  });

  it("supports multiple interpolations", () => {
    expect(encodePath`/A/${"x y"}/B/${"z?"}`).toBe("/A/x%20y/B/z%3F");
  });
});

describe("toJsonPatch", () => {
  it("converts a plain object into RFC 6902 replace operations", () => {
    const patch = toJsonPatch({ Name: "Acme", IsArchived: true });
    expect(patch).toEqual([
      { op: "replace", path: "/Name", value: "Acme" },
      { op: "replace", path: "/IsArchived", value: true },
    ]);
  });

  it("escapes RFC 6901 reserved characters in field names", () => {
    const patch = toJsonPatch({ "weird/field": 1, "tilde~field": 2 });
    expect(patch).toEqual([
      { op: "replace", path: "/weird~1field", value: 1 },
      { op: "replace", path: "/tilde~0field", value: 2 },
    ]);
  });

  it("passes a pre-built patch array through unchanged", () => {
    const input = [{ op: "add", path: "/Foo", value: 1 }];
    expect(toJsonPatch(input)).toBe(input);
  });

  it("rejects non-object input", () => {
    expect(() => toJsonPatch("hello")).toThrow(TypeError);
    expect(() => toJsonPatch(null)).toThrow(TypeError);
    expect(() => toJsonPatch(42)).toThrow(TypeError);
  });
});
