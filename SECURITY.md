# Security Policy

## Supported versions

This is a demonstration project. The `main` branch is the only supported version.

## Reporting a vulnerability

If you believe you have found a security vulnerability in this code, please **do not** open a public issue. Instead, send a private report to:

- **andreas@smpl.no**

Please include:
- A clear description of the vulnerability
- Steps to reproduce
- The affected file paths and (if known) lines
- Your assessment of impact

We aim to acknowledge reports within 3 business days and to address confirmed vulnerabilities promptly.

## Scope

In scope:
- The MCP server code under `src/`
- Build/release pipeline definitions under `.github/workflows/`
- Dependencies declared in `package.json`

Out of scope:
- The PowerOffice Go API itself (please report directly to PowerOffice)
- The Anthropic / Claude API (please report directly to Anthropic)
- The Model Context Protocol specification (please report at the MCP project)
- Vulnerabilities in third-party MCP hosts (Claude Code, Cursor, Cline, etc.)

## Threat model

This server is designed under the following assumptions:

- The operator runs the server on their own machine, under their own user account, with their own PowerOffice Go credentials.
- The operator is trusted; the server does not enforce per-user access controls within a single installation.
- Tool inputs come from an AI assistant operating on the operator's behalf, mediated by the MCP host's tool-confirmation UI.
- The server holds an OAuth bearer token in memory; loss of the host machine compromises that token until expiry (20 minutes).

The server deliberately does **not** expose tools that would let an AI agent take any action with external effect (sending invoices, issuing payment reminders, finalizing sales orders). Adding such tools would require a deliberate code change and code review.

## Hardening checklist for operators

- Set `POWEROFFICE_ATTACHMENT_DIR` only to a directory you trust to be readable by the AI agent.
- Treat `~/.poweroffice-mcp/audit.log` as containing personal data. Restrict access and define your own retention period.
- Use a PowerOffice Go demo or sandbox environment when experimenting.
- Use the Anthropic / OpenAI / etc. Enterprise plans (or local models) when handling real customer data, so the underlying model provider does not retain or train on your data.
- Treat your PowerOffice Go app, client, and subscription keys (and any tokens) as Visma "Confidential Information" under the Developer Terms: keep them in environment variables, never commit them to source control, and never share them.
