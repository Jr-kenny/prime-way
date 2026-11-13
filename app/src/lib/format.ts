// Small formatting helpers. No em dashes anywhere in user-facing copy.

export function formatUsd(n: number, maxDigits = 2): string {
  return (
    '$' +
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits,
    })
  );
}

export function formatToken(amount: number, symbol: string): string {
  const digits = amount >= 100 ? 1 : amount >= 1 ? 2 : 4;
  return amount.toFixed(digits) + ' ' + symbol;
}

export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return address.slice(0, 6) + '…' + address.slice(-4);
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
