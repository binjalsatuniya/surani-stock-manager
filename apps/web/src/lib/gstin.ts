/**
 * GSTIN validation — entirely offline, no API and no cost.
 *
 * A GSTIN is self-describing: 2-digit state code + 10-character PAN + entity digit + 'Z' +
 * checksum. The final character is a checksum over the first fourteen, so a mistyped number can
 * be caught at the moment it is entered rather than surfacing later on a filed return.
 *
 * The company name and address are NOT encoded in the number — those live in the government's
 * database and need a paid lookup service.
 */

const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GST state codes (the first two digits of every GSTIN). */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '96': 'Foreign Country', '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** The expected 15th character for a given first-14. */
function checksumChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = ALPHA.indexOf(first14[i]);
    if (v < 0) return '';
    // Alternating weights of 1 and 2, carrying the base-36 overflow back into the sum.
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return ALPHA[(36 - (sum % 36)) % 36];
}

export interface GstinCheck {
  valid: boolean;
  /** Human-readable problem, when not valid. */
  reason?: string;
  /** State named by the first two digits. */
  state?: string;
  stateCode?: string;
  /** The PAN embedded in characters 3–12. */
  pan?: string;
}

export function inspectGstin(raw: string): GstinCheck {
  const g = (raw || '').trim().toUpperCase().replace(/\s/g, '');
  if (!g) return { valid: false, reason: '' };
  if (g.length !== 15) {
    return { valid: false, reason: `A GST number is 15 characters — this one has ${g.length}` };
  }
  if (!FORMAT.test(g)) {
    return { valid: false, reason: 'Wrong pattern for a GST number (expected 22AAAAA0000A1Z5)' };
  }
  const expected = checksumChar(g.slice(0, 14));
  if (expected && expected !== g[14]) {
    // Nearly always a typo: O/0 and I/1 are the usual culprits.
    return { valid: false, reason: `Check digit is wrong — the last character should be "${expected}"` };
  }
  const stateCode = g.slice(0, 2);
  return {
    valid: true,
    state: GST_STATES[stateCode] ?? 'Unknown state code',
    stateCode,
    pan: g.slice(2, 12),
  };
}
