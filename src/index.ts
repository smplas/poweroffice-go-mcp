#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  apiUrl: requireEnv("POWEROFFICE_API_URL"),
  appKey: requireEnv("POWEROFFICE_APP_KEY"),
  clientKey: requireEnv("POWEROFFICE_CLIENT_KEY"),
  subscriptionKey: requireEnv("POWEROFFICE_SUBSCRIPTION_KEY"),
};

try {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`poweroffice-go MCP failed to start: ${message}`);
  process.exit(1);
}
