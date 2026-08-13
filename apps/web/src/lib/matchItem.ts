import type { Item } from '@surani/shared';

/**
 * Matching a scanned invoice's goods line to an item in the catalogue.
 *
 * The HSN code is NOT enough: one HSN (e.g. 39041020) covers many grades of the same product, so
 * matching on it alone routinely names the wrong material. The invoice prints the actual grade
 * ("HS-1000R", "XINFA SG-5") next to the item, and that text is the reliable signal. These helpers
 * match on the printed description first and fall back to the HSN only when the text gives nothing.
 */

// Words that carry no identity — units, column headers, company-type suffixes. Dropped before
// comparing an invoice's description against item names so only real grade/brand words count.
const STOP_TOKENS = new Set(['KG', 'PCS', 'NOS', 'QTY', 'RATE', 'PER', 'HSN', 'SAC', 'THE', 'AND', 'FOR', 'LTD', 'LLP']);

/** Break text into comparable tokens: upper-case alphanumeric runs of length >= 2, minus stopwords. */
export const descTokens = (s: string): string[] =>
  s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));

/**
 * An item's Code field may list more than one HSN — the same product is sometimes invoiced under
 * two codes. They are separated by a comma (or slash/semicolon), and a match on any one counts.
 */
export const hsnCodesOf = (code: string | null | undefined): string[] =>
  (code || '')
    .split(/[,/;|]+/)
    .map((c) => c.replace(/\s/g, ''))
    .filter(Boolean);

/**
 * Find the item whose name best matches the invoice's printed description/grade. Score by shared
 * tokens, weighting distinctive ones (a grade code with a digit, or a word of 4+ letters) double.
 * Only accept a clear, distinctive winner — otherwise the grade is ambiguous and we defer to the
 * HSN guess or a manual pick, rather than confidently naming the wrong material.
 */
export function bestDescMatch(items: Item[], desc: string | null): Item | null {
  const d = descTokens(desc || '');
  if (!d.length) return null;
  let best: Item | null = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const it of items) {
    const iTok = descTokens(it.name);
    if (!iTok.length) continue;
    let score = 0;
    for (const t of iTok) if (d.includes(t)) score += /\d/.test(t) || t.length >= 4 ? 2 : 1;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = it;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  return bestScore >= 2 && bestScore > secondScore ? best : null;
}

/**
 * Match a goods line to an item: prefer the printed grade/description (the reliable signal), and
 * only fall back to the HSN code (shared across grades, so a mere guess) when the text is no help.
 */
export function matchLineItem(
  items: Item[],
  l: { hsn: string | null; desc: string | null }
): { item: Item | null; by: 'desc' | 'hsn' | null } {
  const byDesc = bestDescMatch(items, l.desc);
  if (byDesc) return { item: byDesc, by: 'desc' };
  if (l.hsn) {
    const byHsn = items.find((it) => hsnCodesOf(it.code).includes(l.hsn!)) ?? null;
    if (byHsn) return { item: byHsn, by: 'hsn' };
  }
  return { item: null, by: null };
}
