// Ported 1:1 from app/index.html (fyOfDate/fyRange/inCurrentFY, lines 1076-1094).
// Kept here so web, mobile, and the API's SQL fy_of_date() function all agree on FY boundaries.
// India financial year: Apr(y)-Mar(y+1), label format "2025-26".

export function fyOfDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function fyRange(fy: string): { from: string; to: string } {
  const [s] = fy.split('-');
  const start = parseInt(s, 10);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function inFY(dateStr: string | null | undefined, fy: string | null): boolean {
  if (!fy) return true;
  if (!dateStr) return false;
  const r = fyRange(fy);
  return dateStr >= r.from && dateStr <= r.to;
}
