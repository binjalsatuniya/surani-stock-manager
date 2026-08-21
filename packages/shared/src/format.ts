// Money formatting with the Indian grouping (lakhs/crores), e.g. 1234567.5 -> "12,34,567.50".
// The grouping is done by hand rather than via toLocaleString('en-IN', …): browsers support that
// locale, but React Native's Hermes engine does not reliably, so a manual pass keeps web and the
// phone showing exactly the same lakh/crore commas.

/** Grouped amount with 2 decimals, no symbol — e.g. "12,34,567.50". Blank/NaN input -> "0.00". */
export function fmtAmount(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v == null || Number.isNaN(Number(v))) return '0.00';
  const num = Number(v);
  const neg = num < 0;
  const [intPart, decPart] = Math.abs(num).toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  // The last three digits stay together; everything before is grouped in twos (Indian system).
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${neg ? '-' : ''}${grouped}.${decPart}`;
}

/** Grouped amount with the ₹ symbol — e.g. "₹12,34,567.50". Null/NaN -> "—". */
export function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `₹${fmtAmount(v)}`;
}
