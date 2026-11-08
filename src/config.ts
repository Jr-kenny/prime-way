// Prime Way app config.
//
// The backend URL is public: it is only a quote service, it holds no
// secret. The Relay API key lives in the backend's environment, never
// in this app. The Privy App ID is read from the environment at build
// time; there is no fallback value and no fake ID is ever used.

export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://prime-way-backend.onrender.com';

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';

export const PRIVY_READY = PRIVY_APP_ID.length > 0;
