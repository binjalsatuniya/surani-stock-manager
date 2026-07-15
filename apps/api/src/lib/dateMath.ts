// Ported from the legacy app's addDays()/daysBetween() helpers used throughout ledger/due-date math.
// Noon-anchored (T12:00:00) like the legacy version, to avoid DST/timezone date-shift bugs that
// midnight-anchored dates are prone to.
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Ported exactly from the legacy daysBetween(a,b) = (a-b)/86400000 (index.html:1800).
// Called as daysBetween(dueDate, today): positive = days remaining, negative = days overdue.
export function daysBetween(aStr: string, bStr: string): number {
  const a = new Date(`${aStr}T12:00:00`);
  const b = new Date(`${bStr}T12:00:00`);
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
