import { fyRange } from '@surani/shared';

/**
 * Builds a Prisma `where` fragment that limits rows to a financial year by DATE RANGE, rather than
 * relying on the `financial_year` column. That column is a DB-maintained value (a generated column
 * / trigger) and isn't populated on every environment — when it's blank, filtering on it hides
 * every row. Filtering on `date` (always present) is correct regardless of how the DB was set up.
 */
export function fyDateWhere(fy: string | undefined): { date?: { gte: Date; lte: Date } } {
  if (!fy) return {};
  const { from, to } = fyRange(fy);
  return { date: { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) } };
}
