// Tests for the Prime Way MCP server.
//
// The tools are driven over the MCP protocol through the SDK's
// in-memory transport, against a mock backend and a mock signer: no
// money moves. A final smoke test spawns the real built server over
// stdio and speaks JSON-RPC to it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { generatePrivateKey } from 'viem/accounts';
import {
  PrimeWay,
  type FetchFn,
  type Signer,
  type StepTx,
} from '@prime-way/sdk';
import { createPrimeWayServer } from '../src/server.js';
import { LIVE_QUOTE, statusSequence } from './fixtures.js';

const WALLET = '0xA37a186AfE306C3EE01D6ABF912cC42BC568091C' as const;
const SARAH = '0x1111111111111111111111111111111111111111' as const;

class MockSigner implements Signer {
  address = WALLET;
  sent: StepTx[] = [];
  async sendTransaction(tx: StepTx): Promise<`0x${string}`> {
    this.sent.push(tx);
    const n = this.sent.length;
    return `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
  }
}

function mockFetch(): FetchFn {
  let statusIdx = 0;
  const seq = statusSequence();
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/quote')) {
      return new Response(JSON.stringify(LIVE_QUOTE), { status: 200 });
    }
    if (u.includes('/status')) {
      const step = seq[Math.min(statusIdx, seq.length - 1)];
      statusIdx += 1;
      return new Response(JSON.stringify(step), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as FetchFn;
}

interface Harness {
  client: Client;
  signer: MockSigner;
  close: () => Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const signer = new MockSigner();
  const primeWay = new PrimeWay({
    wallet: WALLET,
    signer,
    pollIntervalMs: 1,
    pollTimeoutMs: 5000,
    fetch: mockFetch(),
  });
  const server = createPrimeWayServer(primeWay);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: {} },
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    signer,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function textOf(result: unknown): string {
  const r = result as {
    content?: { type?: string; text?: string }[];
  };
  const first = r.content?.[0];
  assert.equal(first?.type, 'text');
  return first?.text ?? '';
}

function jsonOf<T>(result: unknown): T {
  return JSON.parse(textOf(result)) as T;
}

const SEND_ARGS = {
  usdAmount: '100',
  payChainId: 8453,
  paySymbol: 'USDC',
  payPrice: 1,
  destinationChainId: 42161,
  receiveSymbol: 'USDC',
  recipient: SARAH,
};

test('tools/list shows the three Prime Way tools', async () => {
  const h = await startHarness();
  try {
    const list = await h.client.listTools();
    const names = list.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'primeway_quote',
      'primeway_send',
      'primeway_status',
    ]);
  } finally {
    await h.close();
  }
});

test('primeway_quote returns the live fixture', async () => {
  const h = await startHarness();
  try {
    const res = await h.client.callTool({
      name: 'primeway_quote',
      arguments: SEND_ARGS,
    });
    const q = jsonOf<{ outputAmountFormatted: string; feesUsd: number }>(res);
    assert.equal(q.outputAmountFormatted, '0.976173');
    assert.equal(q.feesUsd, 0.024929);
  } finally {
    await h.close();
  }
});

test('primeway_send sends and returns the receipt', async () => {
  const h = await startHarness();
  try {
    const first = await h.client.callTool({
      name: 'primeway_send',
      arguments: SEND_ARGS,
    });
    const out1 = jsonOf<{ requestId: string; status: string }>(first);
    assert.equal(out1.requestId, LIVE_QUOTE.requestId);
    assert.equal(out1.status, 'success');
    assert.equal(h.signer.sent.length, 2);

    // A second identical send sends again: normal usage, no dedup.
    const second = await h.client.callTool({
      name: 'primeway_send',
      arguments: SEND_ARGS,
    });
    jsonOf<{ requestId: string }>(second);
    assert.equal(h.signer.sent.length, 4);
  } finally {
    await h.close();
  }
});

test('primeway_status reports the send', async () => {
  const h = await startHarness();
  try {
    await h.client.callTool({
      name: 'primeway_send',
      arguments: SEND_ARGS,
    });
    const st = await h.client.callTool({
      name: 'primeway_status',
      arguments: { requestId: LIVE_QUOTE.requestId },
    });
    const status = jsonOf<{ status: string }>(st);
    // The send above already walked the mock status sequence to the
    // end, so the next check answers the final state: success.
    assert.equal(status.status, 'success');
  } finally {
    await h.close();
  }
});

// --- stdio smoke tests against the built server ---

const MCP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function runServer(env: NodeJS.ProcessEnv): ReturnType<typeof spawn> {
  return spawn('node', [join(MCP_DIR, 'dist', 'index.js')], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function waitExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += String(d)));
    child.on('exit', (code) => resolve({ code, stderr }));
  });
}

test('the built server refuses to start without its config', async () => {
  const child = runServer({
    PRIMEWAY_PRIVATE_KEY: '',
  });
  child.stdin?.end();
  const { code, stderr } = await waitExit(child);
  assert.notEqual(code, 0);
  assert.match(stderr, /PRIMEWAY_PRIVATE_KEY is not set/);
});

test('the built server answers initialize over stdio', async () => {
  const key = generatePrivateKey();
  const child = runServer({
    PRIMEWAY_PRIVATE_KEY: key,
  });
  try {
    const init = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'smoke', version: '0' },
      },
    });
    let out = '';
    const got = new Promise<void>((resolve) => {
      child.stdout?.on('data', (d) => {
        out += String(d);
        if (out.includes('"id":1')) resolve();
      });
    });
    child.stdin?.write(init + '\n');
    await Promise.race([
      got,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('no initialize answer')), 10000),
      ),
    ]);
    const line = out.split('\n').find((l) => l.includes('"id":1'));
    assert.ok(line, 'expected a response with id 1');
    const parsed = JSON.parse(line) as { result?: { serverInfo?: { name?: string } } };
    assert.equal(parsed.result?.serverInfo?.name, 'prime-way');
  } finally {
    child.kill();
  }
});
