// Stub test for Prime Way discovery (#3) and history sync (#4).
// Runs in plain Node against compiled lib files. No network: fetch is
// stubbed to serve the backend /chains + /currencies contract, CoinGecko
// prices, and a fake balance reader stands in for on-chain calls.
//
// Run from app/:
//   npx tsc --ignoreConfig src/lib/discovery.ts src/lib/balances.ts src/lib/chains.ts \
//     src/lib/relay.ts src/lib/historySync.ts src/store/history.ts src/config.ts \
//     --outDir /tmp/pw-test --module commonjs --target es2022 --moduleResolution node \
//     --esModuleInterop --skipLibCheck --declaration false
//   DISCOVERY_BUILD_DIR=/tmp/pw-test NODE_PATH=$PWD/node_modules node scripts/discovery-stub-test.cjs
// The compiled output needs an in-memory AsyncStorage stub at
// /tmp/pw-test/node_modules/@react-native-async-storage/async-storage (see test header
// in the repo history); without it the history part cannot load in Node.
'use strict';
const assert = require('node:assert');

process.env.EXPO_PUBLIC_BACKEND_URL = 'http://stub.local';

const {
  parseBackendChains,
  parseCurrencies,
  discoverBalances,
  mergeBalances,
  totalUsdForMerged,
  loadCachedDiscovery,
  saveCachedDiscovery,
} = require(process.env.DISCOVERY_BUILD_DIR + '/lib/discovery');
const { historyStatusFor, syncPendingHistory } = require(process.env.DISCOVERY_BUILD_DIR + '/lib/historySync');
const { addHistory, loadHistory } = require(process.env.DISCOVERY_BUILD_DIR + '/store/history');

const ZERO = '0x0000000000000000000000000000000000000000';
const USDC_LINEA = '0x' + 'a1'.repeat(20);
const DAI_LINEA = '0x' + 'b2'.repeat(20);

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + ': ' + (e && e.message));
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('PASS ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + ': ' + (e && e.message));
  }
}

// Stub backend + CoinGecko.
global.fetch = async (url) => {
  const u = String(url);
  const json = (obj) => ({ ok: true, json: async () => obj });
  if (u === 'http://stub.local/chains') {
    // Real backend shape: {chains: [...]} with `rpcUrl` (see backend/CHAINS.md).
    return json({ chains: [
      { id: 56, name: 'BNB Chain', displayName: 'BNB Chain', evm: true,
        nativeCurrency: { symbol: 'BNB', decimals: 18 },
        rpcUrl: 'https://bsc-dataseed.binance.org' },
      { id: 59144, name: 'Linea', displayName: 'Linea', evm: true,
        rpcUrl: 'https://rpc.linea.build',
        nativeCurrency: { symbol: 'ETH', decimals: 18 } },
      { id: 792703809, name: 'Solana', displayName: 'Solana', evm: false,
        nativeCurrency: { symbol: 'SOL', decimals: 9 } },
      { id: 99999, name: 'No RPC Chain', displayName: 'No RPC Chain', evm: true,
        nativeCurrency: { symbol: 'NOP', decimals: 18 } },
      { id: 'bad', name: 'Bad Row' },
      { name: 'No Id' },
    ] });
  }
  if (u === 'http://stub.local/currencies?chainId=59144') {
    // Real backend shape: {chainId, currencies: [...]} (see backend/server.js).
    return json({ chainId: 59144, currencies: [
      { address: USDC_LINEA, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
      { address: ZERO, symbol: 'ETH', decimals: 18, name: 'Ether' },
      { address: DAI_LINEA, symbol: 'DAI', decimals: 18, name: 'Dai' },
      { address: USDC_LINEA, symbol: 'USDC', decimals: 6, name: 'dup' },
      { address: 'not-an-address', symbol: 'BAD', decimals: 6, name: 'Bad' },
      { address: '0x1111111111111111111111111111111111111111', symbol: 'BIG', decimals: 300, name: 'Bad dec' },
    ] });
  }
  if (u.startsWith('https://api.coingecko.com/')) {
    return json({
      ethereum: { usd: 3000, usd_24h_change: 1.5 },
      'usd-coin': { usd: 1, usd_24h_change: 0 },
    });
  }
  throw new Error('unexpected fetch: ' + u);
};

const memoryStore = () => {
  const map = new Map();
  return {
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => { map.set(k, v); },
  };
};

// Stub on-chain reader: Linea USDC 25, native ETH 0, DAI 10.
const balanceReader = async (chain, address, currency) => {
  if (chain.id === 59144 && currency.address === USDC_LINEA) return 25_000000n;
  if (chain.id === 59144 && currency.address === DAI_LINEA) return 10n * 10n ** 18n;
  return 0n;
};

(async () => {
  check('parseBackendChains drops malformed rows', () => {
    const chains = parseBackendChains([
      { id: 59144, name: 'Linea', rpc: 'https://rpc.linea.build' },
      { id: 'bad' },
      { name: 'No Id' },
      { id: 1, name: 'Ethereum', rpcUrls: { default: { http: ['https://eth.llamarpc.com'] } } },
    ]);
    assert.deepStrictEqual(chains.map((c) => c.id), [59144, 1]);
    assert.strictEqual(chains[1].rpc, 'https://eth.llamarpc.com');
  });

  check('parseBackendChains reads the real backend shape ({chains}, rpcUrl)', () => {
    const chains = parseBackendChains({ chains: [
      { id: 59144, name: 'Linea', displayName: 'Linea', evm: true,
        rpcUrl: 'https://rpc.linea.build',
        nativeCurrency: { symbol: 'ETH', decimals: 18 } },
      { id: 792703809, name: 'Solana', displayName: 'Solana', evm: false,
        nativeCurrency: { symbol: 'SOL', decimals: 9 } },
      { id: 'bad' },
    ] });
    assert.deepStrictEqual(chains.map((c) => c.id), [59144, 792703809]);
    assert.strictEqual(chains[0].rpc, 'https://rpc.linea.build');
    assert.strictEqual(chains[1].rpc, null);
  });

  check('parseCurrencies reads the real backend shape ({chainId, currencies})', () => {
    const out = parseCurrencies({ chainId: 59144, currencies: [
      { address: USDC_LINEA, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
      { address: USDC_LINEA, symbol: 'USDC', decimals: 6, name: 'dup' },
      { address: 'nope', symbol: 'BAD', decimals: 6 },
    ] });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].symbol, 'USDC');
  });

  check('parseCurrencies drops bad rows and dedupes', () => {
    const out = parseCurrencies([
      { address: USDC_LINEA, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
      { address: USDC_LINEA, symbol: 'USDC', decimals: 6, name: 'dup' },
      { address: 'nope', symbol: 'BAD', decimals: 6 },
      { address: '0x1111111111111111111111111111111111111111', symbol: 'BIG', decimals: 300 },
    ]);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].symbol, 'USDC');
  });

  await checkAsync('discoverBalances finds Linea USDC + DAI, skips the rest', async () => {
    const res = await discoverBalances('0x1111111111111111111111111111111111111111', {
      balanceReader,
      storage: memoryStore(),
    });
    assert.deepStrictEqual(res.scannedChainIds, [59144]);
    assert.strictEqual(res.assets.length, 2);
    const usdc = res.assets.find((a) => a.symbol === 'USDC');
    const dai = res.assets.find((a) => a.symbol === 'DAI');
    assert.ok(usdc && dai);
    assert.strictEqual(usdc.amount, 25);
    assert.strictEqual(usdc.raw, 25_000000n);
    assert.strictEqual(usdc.priceUsd, 1);
    assert.strictEqual(dai.amount, 10);
    // DAI has no price in the stubbed CoinGecko reply: amount shows, price null.
    assert.strictEqual(dai.priceUsd, null);
    assert.ok(res.skipped.some((s) => s.chainId === 792703809));
    assert.ok(res.skipped.some((s) => s.chainId === 99999));
    // Known fast-path chain 56 was not re-scanned.
    assert.ok(!res.scannedChainIds.includes(56));
  });

  await checkAsync('merge dedupes fast-path wins; total is null when any price is missing', async () => {
    const fast = [{
      chainId: 8453, chainName: 'Base', symbol: 'USDC', amount: 5, raw: 5_000000n,
      decimals: 6, priceUsd: 1, change24h: 0, color: '#2E6BE6', letter: '$',
      tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    }];
    const discovered = [{
      chainId: 59144, chainName: 'Linea', symbol: 'DAI', amount: 10, raw: 10n * 10n ** 18n,
      decimals: 18, priceUsd: null, change24h: null, color: '#5B6470', letter: 'D',
      tokenAddress: DAI_LINEA,
    }, { ...fast[0], chainId: 8453, amount: 999 }];
    const merged = mergeBalances(fast, discovered);
    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged.find((a) => a.chainId === 8453).amount, 5);
    // One unpriced asset -> total is null, never invented.
    assert.strictEqual(totalUsdForMerged(fast, discovered), null);
    assert.strictEqual(totalUsdForMerged(fast, []), 5);
  });

  await checkAsync('cache round-trips BigInt raw and expires after TTL', async () => {
    const store = memoryStore();
    const now = Date.now();
    const res = await discoverBalances('0x1111111111111111111111111111111111111111', {
      balanceReader, storage: store, now: () => now,
    });
    await saveCachedDiscovery(res, store);
    const loaded = await loadCachedDiscovery(store, () => now + 1000);
    assert.ok(loaded && loaded.length === 2);
    assert.strictEqual(typeof loaded[0].raw, 'bigint');
    const expired = await loadCachedDiscovery(store, () => now + 11 * 60 * 1000);
    assert.strictEqual(expired, null);
  });

  check('historyStatusFor maps success/refund, failure stays pending', () => {
    assert.strictEqual(historyStatusFor('success'), 'sent');
    assert.strictEqual(historyStatusFor('refund'), 'refunded');
    assert.strictEqual(historyStatusFor('waiting'), null);
    assert.strictEqual(historyStatusFor('depositing'), null);
    assert.strictEqual(historyStatusFor('pending'), null);
    assert.strictEqual(historyStatusFor('failure'), null);
  });

  await checkAsync('syncPendingHistory settles success, keeps failure pending', async () => {
    await addHistory({
      requestId: '0x' + 'aa'.repeat(32), toName: 'Sarah', toNetwork: 'Base',
      usd: 50, received: '49.8 USDC', receiveSymbol: 'USDC', status: 'pending', date: Date.now(),
    });
    await addHistory({
      requestId: '0x' + 'bb'.repeat(32), toName: 'Emma', toNetwork: 'Base',
      usd: 10, received: '9.9 USDC', receiveSymbol: 'USDC', status: 'pending', date: Date.now(),
    });
    const fetchFn = async (requestId) => ({
      status: requestId.startsWith('0xaa') ? 'success' : 'failure',
    });
    const entries = await syncPendingHistory(fetchFn);
    const sarah = entries.find((e) => e.toName === 'Sarah');
    const emma = entries.find((e) => e.toName === 'Emma');
    assert.strictEqual(sarah.status, 'sent');
    assert.strictEqual(emma.status, 'pending');
    // A failed check must not throw or block the other entry.
    assert.strictEqual((await loadHistory()).length, 2);
  });

  console.log(failures === 0 ? 'ALL STUB TESTS PASSED' : failures + ' TEST(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST RUNNER ERROR', e);
  process.exit(1);
});
