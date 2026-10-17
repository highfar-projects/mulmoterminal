// An in-memory MCP client for buildGuiMcpServer, and a fetch double for the two hosts the broker
// POSTs to. Shared by the broker specs so each drives the real SDK path rather than the handler.
import { vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { buildGuiMcpServer } from "../../server/mcp/broker.js";

// The two hosts the broker POSTs to: the plugin dispatch route, and the toolResult sink.
export function stubFetch(dispatch: () => { status: number; body: unknown }) {
  return vi.fn(async (url: unknown) => {
    if (String(url).includes("/api/plugin/")) {
      const { status, body } = dispatch();
      return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  });
}

export async function callTool(server: ReturnType<typeof buildGuiMcpServer>, name: string, args: Record<string, unknown>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "spec", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
    await server.close();
  }
}
