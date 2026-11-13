# Prime Way — the real app

Prime Way is a Prime Isles product. It lets everyday people send money
to someone on a different chain: pick a person, type an amount, tap
send. The money arrives. No swapping, no bridging, no trading screens.

This is the real app (Expo, React Native, TypeScript), not the flow
prototype. The prototype lives at the repo root (`index.html`) and is
the design reference: same screens, same fox, same themes.

## Run it

```sh
cd app
npm install
cp .env.example .env   # then fill in the Privy App ID, see below
npx expo start
```

Scan the QR code with the Expo Go app, or press `a` for Android.
Privy needs a **development build**, not Expo Go: its native modules
(`react-native-quick-crypto` and friends) only run in a build that
includes them.

```sh
npx expo run:android   # local development build (needs Android Studio)
```

## What it needs

| Need | Status | How to get it |
| --- | --- | --- |
| Privy App ID | **Not set yet** | Create an app at privy.io, copy the App ID into `.env` as `EXPO_PUBLIC_PRIVY_APP_ID`. Without it, the Privy screens explain what is missing and the import-wallet path still works. |
| Expo account | **Not set yet** | Needed for the APK build (EAS). See below. |
| Relay API key | Already live | The key lives in the backend's environment on Render, never in this app. |

No other key or secret is needed. Balances read from public RPCs,
prices from CoinGecko's public endpoint, quotes from the live backend
at https://prime-way-backend.onrender.com.

## What works now

- Welcome (onboarding: create with email, create with recovery
  phrase, or import), Home (account header, big USD total, Send and
  Receive, real assets with brand icons, biggest value first),
  Receive (real QR code of your address, copy, real system share,
  and a cross-chain move that sends to yourself from another
  network), History (real sends only), Swap (live Relay quote to
  move an asset to another chain, into your own wallet), Contacts
  (people plus a typed address), Settings (appearance pill,
  Manage Wallets, Security).
- Send flow: pick a person or paste an address, type dollars, pick
  number is a **live Relay quote** from the backend, with a Live tag
  and the live fee. The confirm screen shows the same live number.
- Wallet: email-code login and wallet creation through Privy, plus
  create with a fresh 12-word phrase, import private key / import
  seed phrase (kept in the device secure store, one wallet per
  entry, switchable). Export wallet shows the phrase or key for
  imported wallets. A 4-number send PIN is set per wallet in
  Security and is mandatory before any send.
- Contacts are saved on the device and start empty. A contact without an address cannot be sent to
  until one is added.
- Themes: true AMOLED white and true AMOLED black, following the
  device by default, changeable in Settings.

## One thing before real sends work

The backend's quote endpoint currently returns each step as id,
action and description only. To send, the wallet needs the
transaction itself (to, data, value, chain id) for the approve step
and the deposit step. The app already runs those steps when they are
there; until then the Send button stays off and says so.

The backend change is one small edit in `backend/server.js`,
in `shapeQuote`:

```js
steps: (relay.steps || []).map((step) => ({
  id: step.id,
  action: step.action,
  description: step.description,
  tx: step.transaction
    ? {
        to: step.transaction.to,
        data: step.transaction.data,
        value: step.transaction.value ?? '0',
        chainId: step.transaction.chainId,
      }
    : undefined,
})),
```

(Use whatever field Relay actually returns the step transaction
under; check one live quote response first.) After that change is
deployed, sends work with no app change. The app then runs approve,
then deposit, with the connected wallet, records the send in
History, and polls `GET /status?requestId=...` until it lands or is
refunded.

## APK build (later)

The APK needs an Expo account and a development build:

```sh
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

That step is deliberately not done here: it needs the user's Expo
account.

## Layout

```
App.tsx                  Providers (theme, wallet) + fonts
index.ts                 Entry, Privy polyfills first
app.json                 Name, slug, scheme (primeway), icons
src/config.ts            Backend URL, Privy env vars
src/theme.ts             AMOLED white / black palettes, fonts
src/theme-context.tsx    Theme state (system / light / dark)
src/lib/chains.ts        Supported chains + token addresses (Relay, 2026-11-08)
src/lib/relay.ts         Backend client: quote + status, dollars to units
src/lib/balances.ts      Real balances from public RPCs + CoinGecko prices
src/lib/send.ts          Run a quote's steps with the connected wallet
src/lib/format.ts        USD, token and address formatting
src/wallet/WalletContext.tsx  Privy + imported wallet, one address
src/store/               Contacts, history, settings (on the device)
src/components/          Pip (the fox), Tip (?), shared UI bits
src/screens/             Every screen, ported from the prototype
src/navigation/          Tabs + stack
scripts/make-icons.cjs   Regenerate the app icons from the Pip SVG
```

## Rules the app keeps

- Home keeps the big USD total at the top. Receive + Send, no
  Withdraw anywhere, no onramp.
- Contacts live in their own tab; Settings no longer lists an
  Address Book row.
- Amounts in dollars; receive defaults to USDC.
- No em dashes in UI copy. Plain simple words. Explanations hide
  behind a small tip (?) icon, never left open.
- The app never shows a made-up number: no sample balances, no
  sample quotes. When a live number cannot be reached, it says so.
