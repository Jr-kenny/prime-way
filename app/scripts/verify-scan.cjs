// Read-only verification of the new Prime Way scan path.
// Uses the same calls the app makes (same public RPCs, same
// Multicall3, same Trust Wallet icon URLs, same Solana RPC, same
// backend /quote) but runs in plain node. No keys, no signing,
// no sending. Usage: node scripts/verify-scan.cjs [address]
const { createPublicClient, http, erc20Abi, formatUnits, getAddress } = require('viem');
const { bsc, base, arbitrum, mainnet, optimism, polygon, avalanche } = require('viem/chains');

const ADDR = process.argv[2] || '0xA37a186AfE306C3EE01D6ABF912cC42BC568091C';
const BACKEND = 'https://prime-way-backend.onrender.com';
const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

const CHAINS = [
  { id: 56, name: 'BNB Chain', chain: bsc, rpc: 'https://bsc-dataseed.binance.org', tokens: [
    { symbol: 'BNB', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'binancecoin' },
    { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18, native: false, cg: 'usd-coin' },
    { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18, native: false, cg: 'tether' }] },
  { id: 8453, name: 'Base', chain: base, rpc: 'https://mainnet.base.org', tokens: [
    { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'ethereum' },
    { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6, native: false, cg: 'usd-coin' },
    { symbol: 'USDT', address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', decimals: 6, native: false, cg: 'tether' }] },
  { id: 42161, name: 'Arbitrum', chain: arbitrum, rpc: 'https://arb1.arbitrum.io/rpc', tokens: [
    { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'ethereum' },
    { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6, native: false, cg: 'usd-coin' },
    { symbol: 'USDT', address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6, native: false, cg: 'tether' }] },
  { id: 1, name: 'Ethereum', chain: mainnet, rpc: 'https://eth.llamarpc.com', tokens: [
    { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'ethereum' },
    { symbol: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, native: false, cg: 'usd-coin' },
    { symbol: 'USDT', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6, native: false, cg: 'tether' }] },
  { id: 10, name: 'Optimism', chain: optimism, rpc: 'https://mainnet.optimism.io', tokens: [
    { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'ethereum' },
    { symbol: 'USDC', address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6, native: false, cg: 'usd-coin' },
    { symbol: 'USDT', address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6, native: false, cg: 'tether' }] },
  { id: 137, name: 'Polygon', chain: polygon, rpc: 'https://polygon-rpc.com', tokens: [
    { symbol: 'POL', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'matic-network' },
    { symbol: 'USDC', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6, native: false, cg: 'usd-coin' },
    { symbol: 'USDT', address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6, native: false, cg: 'tether' }] },
  { id: 43114, name: 'Avalanche', chain: avalanche, rpc: 'https://api.avax.network/ext/bc/C/rpc', tokens: [
    { symbol: 'AVAX', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true, cg: 'avalanche-2' },
    { symbol: 'USDC', address: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', decimals: 6, native: false, cg: 'usd-coin' }] },
];

async function main() {
  console.log('wallet:', ADDR);
  // 1. Prices (same CoinGecko call as the app)
  const ids = [...new Set(CHAINS.flatMap((c) => c.tokens.map((t) => t.cg)))];
  const pres = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`);
  const prices = pres.ok ? await pres.json() : {};
  console.log('prices ok:', pres.ok, pres.status);

  // 2. Fast-path balances with Multicall3, fallback to balanceOf
  const found = [];
  for (const c of CHAINS) {
    const client = createPublicClient({ chain: c.chain, transport: http(c.rpc) });
    const erc20 = c.tokens.filter((t) => !t.native);
    let batched = null;
    try {
      const res = await client.multicall({ contracts: erc20.map((t) => ({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [ADDR] })) });
      if (res.every((r) => r.status === 'success')) batched = new Map(erc20.map((t, i) => [t.address.toLowerCase(), res[i].result]));
    } catch (e) { console.log(`  ${c.name}: multicall failed (${String(e.message).slice(0, 80)}), falling back`); }
    for (const t of c.tokens) {
      try {
        let raw;
        if (t.native) raw = await client.getBalance({ address: ADDR });
        else if (batched) raw = batched.get(t.address.toLowerCase());
        else raw = await client.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [ADDR] });
        if (raw === 0n) continue;
        const amt = Number(formatUnits(raw, t.decimals));
        const price = prices[t.cg]?.usd ?? null;
        found.push({ chain: c.name, symbol: t.symbol, amount: amt, usd: price === null ? null : amt * price, multicall: !!batched });
        console.log(`  FOUND ${c.name} ${t.symbol} ${amt} (multicall: ${!!batched})`);
      } catch (e) { console.log(`  ${c.name} ${t.symbol}: read failed (${String(e.message).slice(0, 60)})`); }
    }
  }
  console.log('total non-zero fast-path assets:', found.length);

  // 3. Trust Wallet icon HEAD checks for the found assets + known tokens
  const iconChecks = [
    ['Base', 'USDC', `${TW}/base/assets/${getAddress('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')}/logo.png`],
    ['BNB', 'USDC', `${TW}/smartchain/assets/${getAddress('0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d')}/logo.png`],
    ['Ethereum', 'ETH native', `${TW}/ethereum/info/logo.png`],
    ['BNB', 'BNB native', `${TW}/smartchain/info/logo.png`],
    ['Base', 'ETH native', `${TW}/base/info/logo.png`],
    ['Solana', 'SOL native', `${TW}/solana/info/logo.png`],
    ['Solana', 'USDC', `${TW}/solana/assets/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`],
    ['Solana', 'USDT', `${TW}/solana/assets/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png`],
    ['Optimism', 'ETH native', `${TW}/optimism/info/logo.png`],
    ['Polygon', 'POL native', `${TW}/polygon/info/logo.png`],
    ['Avalanche', 'AVAX native', `${TW}/avalanchec/info/logo.png`],
    ['Arbitrum', 'ETH native', `${TW}/arbitrum/info/logo.png`],
    ['Random token (expect 404)', 'NOPE', `${TW}/base/assets/${getAddress('0x000000000000000000000000000000000000dead')}/logo.png`],
  ];
  for (const [chain, sym, url] of iconChecks) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      console.log(`  icon ${chain} ${sym}: ${r.status}`);
    } catch (e) { console.log(`  icon ${chain} ${sym}: fetch error`); }
  }

  // 4. Solana RPC (watch-only): use a known funded address? Use the user's
  //    Solana address if given as 2nd arg, else just check the RPC is up.
  const solAddr = process.argv[3];
  if (solAddr) {
    const body = { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [solAddr] };
    const r = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    console.log('solana getBalance:', JSON.stringify(j.result));
  } else {
    console.log('solana: no address given, skipped (pass one as 2nd arg to test)');
  }

  // 5. Backend /quote: same-chain same-token vs cross-chain same-asset
  const quote = async (label, req) => {
    try {
      const r = await fetch(`${BACKEND}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      const j = await r.json();
      console.log(`  quote ${label}: HTTP ${r.status} ${j.error ? 'error=' + j.error : 'output=' + j.outputAmountFormatted + ' ' + j.outputCurrency + ' steps=' + (j.steps || []).length}`);
    } catch (e) { console.log(`  quote ${label}: fetch error ${e.message}`); }
  };
  await quote('same-chain same-token USDC Base->Base $1', {
    user: ADDR, recipient: ADDR, originChainId: 8453, destinationChainId: 8453,
    originCurrency: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    destinationCurrency: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', amount: '1000000',
  });
  await quote('cross-chain same-asset USDC BSC->Base $1', {
    user: ADDR, recipient: ADDR, originChainId: 56, destinationChainId: 8453,
    originCurrency: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    destinationCurrency: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', amount: '1000000000000000000',
  });
  await quote('cross-chain USDC Base->Arbitrum $1', {
    user: ADDR, recipient: ADDR, originChainId: 8453, destinationChainId: 42161,
    originCurrency: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    destinationCurrency: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', amount: '1000000',
  });
}

main().catch((e) => { console.error('verify failed:', e); process.exit(1); });
