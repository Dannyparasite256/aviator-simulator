/**
 * Player-facing currency is UGX.
 * Internal ledger remains `virtualCredits` at 1:1 with UGX.
 */
export const CURRENCY_CODE = 'UGX';
export const CURRENCY_LABEL = 'UGX';

/** Format a balance / bet amount for UI (UGX, whole shillings by default). */
export function formatMoney(
  amount: number,
  opts?: { decimals?: number; signed?: boolean; compact?: boolean },
): string {
  const decimals = opts?.decimals ?? 0;
  const n = Number(amount);
  if (!Number.isFinite(n)) return `0 ${CURRENCY_LABEL}`;
  const abs = Math.abs(n);
  const body = abs.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = opts?.signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  if (opts?.compact) return `${sign}${body}`;
  return `${sign}${body} ${CURRENCY_LABEL}`;
}

export function moneyUnit(): string {
  return CURRENCY_LABEL;
}
