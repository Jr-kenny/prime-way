// Wallet connection through wagmi.
//
// Connectors: injected browser wallets (MetaMask, Rabby, Brave, ...)
// and Coinbase Wallet. Neither needs a project id, an API key, or
// any account: the user connects in their own wallet, and Prime Way
// never asks for a private key or seed phrase.
//
// WalletConnect / Reown AppKit is deliberately NOT wired in: it
// needs a Reown Cloud project id, which does not exist for this app.

import { http, createConfig } from "wagmi";
import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  gnosis,
  linea,
  mainnet,
  mode,
  optimism,
  polygon,
  scroll,
  zksync,
} from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const WAGMI_CHAINS = [
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  bsc,
  avalanche,
  gnosis,
  linea,
  scroll,
  zksync,
  blast,
  mode,
] as const;

export const wagmiConfig = createConfig({
  chains: [...WAGMI_CHAINS],
  connectors: [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: "Prime Way" }),
  ],
  ssr: false,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
    [avalanche.id]: http(),
    [gnosis.id]: http(),
    [linea.id]: http(),
    [scroll.id]: http(),
    [zksync.id]: http(),
    [blast.id]: http(),
    [mode.id]: http(),
  },
});
