// Metro config for Prime Way.
//
// The Privy SDK pulls in `jose` for signing. `jose` ships a Node build
// (which imports Node's `crypto`) and a browser build (which uses the
// WebCrypto the Privy polyfills provide). Metro resolves the Node build
// by default, which cannot run on a phone, so this maps `jose` to its
// browser build. Nothing else is redirected.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jose') {
    return {
      filePath: path.join(
        __dirname,
        'node_modules',
        'jose',
        'dist',
        'browser',
        'index.js',
      ),
      type: 'sourceFile',
    };
  }
  if (typeof originalResolveRequest === 'function') {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
