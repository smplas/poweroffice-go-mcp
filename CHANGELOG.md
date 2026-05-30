# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-05-27

Pre-event security and quality review pass ahead of public inspection at
Tech-Forum Stavanger 4 June 2026.

### Added
- Test suite (Vitest) covering the rate limiter, audit log, JSON Patch
  conversion, path encoder, and invoice validator. 25 tests on initial release.
- GitHub Actions CI: type-check, build, audit, and test on every push.
- CodeQL static analysis with the `security-and-quality` query suite.
- Dependabot configuration for weekly npm and monthly GitHub Actions updates.
- `SECURITY.md` describing the threat model, scope, and reporting channel.
- `sbom.json` snapshot of the dependency tree.
- `.nvmrc` pinning the Node major version.

### Changed
- All API path segments are now URL-encoded via a dedicated `encodePath` helper
  to prevent path-segment injection from caller-supplied IDs.
- Upstream API error bodies are no longer included in error messages by
  default (set `POWEROFFICE_DEBUG=1` to opt in). Prevents PII echo into the
  LLM context and audit log.
- 429 (rate limit) responses are auto-retried for GET only, with a max of 3
  attempts. Write operations now surface the 429 so the caller can decide
  whether to retry.
- Rate limiter acquires are serialised through an internal queue so concurrent
  callers cannot collectively drive the token bucket below zero.
- Audit log file and directory are created with 0600 / 0700 permissions.
- `add_invoice_attachment` requires `POWEROFFICE_ATTACHMENT_DIR` and rejects
  files outside that directory, files over 10 MB, and unknown file
  extensions.
- Zod schemas tightened across all tools: GUID regex for sales order IDs,
  positive-int constraints on numeric IDs, email/URL validation, org-number
  regex, and length caps on free-text fields.
- `src/api/types.ts` rewritten in PascalCase to match the actual API shape.
- All Zod fields now have `.describe()` so the LLM sees a consistent surface.

### Fixed
- `update_draft_invoice` was emitting a camelCase PATCH body that PowerOffice
  silently ignored. The body is now PascalCase and the affected fields apply
  correctly.
- `create_customer` description claimed the default delivery type was
  `PdfByEmail`; it has always been `Print`. Description corrected.
- OAuth refresh now clears the stale token before attempting the request, so
  a failure mid-flight cannot leave an expired credential in place.

### Removed
- Unused `ApiListResponse` and `ApiError` types and their imports.
- Dead defensive-parsing branches in `list_invoices` that handled response
  shapes the upstream API does not return.

## [0.2.0] — 2026-05-21

### Added
- 32 tools across customers, products, sales orders, outgoing invoices,
  customer ledger, employees, dimensions, settings, prospects, and
  invoice validation.
- Append-only audit log of every tool invocation.

## [0.1.0] — 2026-04-12

Initial commit. PowerOffice Go MCP server with stdio transport, OAuth 2.0
client-credentials authentication, and a draft-only tool surface.
