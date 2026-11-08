#!/usr/bin/env node
// Prime Way MCP server: stdio entry point.
//
// Reads its config from the environment (see config.ts), then serves
// the Prime Way tools over stdio. Run it from an MCP client, e.g.:
//   PRIMEWAY_PRIVATE_KEY=0x... primeway-mcp

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configFromEnv } from './config.js';
import { createPrimeWayServer } from './server.js';

async function main(): Promise<void> {
  let client;
  try {
    client = configFromEnv(process.env);
  } catch (err) {
    console.error(
      `primeway-mcp: ${err instanceof Error ? err.message : 'bad config'}`,
    );
    process.exit(1);
  }
  const server = createPrimeWayServer(client);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(
    `primeway-mcp: ${err instanceof Error ? err.message : 'failed to start'}`,
  );
  process.exit(1);
});
