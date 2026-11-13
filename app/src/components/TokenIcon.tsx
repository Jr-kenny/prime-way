// TokenIcon: a token's real brand icon, or "?" when there is none.
//
// Resolution order (see lib/tokenIcons): a supplied iconUrl, then
// CoinGecko, then CoinMarketCap via the backend, then Trust Wallet. Every real
// token was listed with its icon, so the wallet shows that symbol.
// Only a token no source can resolve — mostly unverified, not
// listed anywhere — gets "?" in the icon slot, because there is no
// verified symbol. There is no user-import flow: a token's icon is
// not on chain, and a user cannot be expected to have it. A token
// row always renders, with or without an icon.
// There is no letter placeholder anywhere, and the icon is never
// tappable — it is display only.

import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { resolveIconUrl } from '../lib/tokenIcons';
import type { AssetBalance } from '../lib/balances';
import { useTheme } from '../theme-context';

export type TokenIconAsset = Pick<
  AssetBalance,
  'chainId' | 'symbol' | 'tokenAddress' | 'vmType' | 'native'
> & { iconUrl?: string | null };

export function TokenIcon({ asset, size = 44 }: { asset: TokenIconAsset; size?: number }) {
  const { palette } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setUri(null);
    (async () => {
      const resolved = await resolveIconUrl(
        asset.chainId,
        asset.tokenAddress,
        asset.native,
        asset.iconUrl,
        asset.symbol,
      );
      if (!alive) return;
      if (resolved) {
        setUri(resolved);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [asset.chainId, asset.tokenAddress, asset.native, asset.iconUrl]);

  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: palette.soft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={circle}
        accessibilityLabel={`${asset.symbol} icon`}
        onError={() => setFailed(true)}
      />
    );
  }

  if (!failed) {
    // Still resolving: a plain soft circle, never a letter.
    return <View style={circle} />;
  }

  // No verified symbol anywhere: "?" — the token is mostly
  // unverified. The row still renders; nothing is hidden.
  return (
    <View style={circle} accessibilityLabel={`No verified icon for ${asset.symbol}`}>
      <Text
        style={{
          fontSize: size * 0.5,
          fontWeight: '800',
          color: palette.muted,
          lineHeight: size * 0.6,
        }}
      >
        ?
      </Text>
    </View>
  );
}
