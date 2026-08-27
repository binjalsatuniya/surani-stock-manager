// Fields the superadmin can make mandatory or optional. Each has a sensible default.
// Forms read the effective setting and block submission when a required field is blank.
// Only fields that can legitimately be left blank are listed (core fields like name/qty/
// rate/party/item are always required and aren't configurable here).

export type FieldSettingKey = string;

export interface FieldSettingDef {
  key: FieldSettingKey;
  label: string;
  group: string;
  defaultRequired: boolean;
}

// A behavioural toggle (not a mandatory-field rule): whether every sales person may see and take
// orders for every party. Default OFF = each sales person is limited to their own assigned parties.
export const SALES_SEE_ALL_PARTIES = 'order.salesSeeAllParties';

export const FIELD_SETTINGS: FieldSettingDef[] = [
  // ---- Parties ----
  { key: 'party.salesPerson', label: 'Sales person', group: 'Parties', defaultRequired: false },
  { key: 'party.phone', label: 'Phone / WhatsApp number', group: 'Parties', defaultRequired: false },
  { key: 'party.email', label: 'Email', group: 'Parties', defaultRequired: false },
  { key: 'party.gst', label: 'GST number', group: 'Parties', defaultRequired: false },
  { key: 'party.address', label: 'Address', group: 'Parties', defaultRequired: false },
  { key: 'party.locationUrl', label: 'Location link (Google Maps)', group: 'Parties', defaultRequired: false },
  { key: 'party.vehicle', label: 'Vehicle (transporters)', group: 'Parties', defaultRequired: false },

  // ---- Item Master ----
  { key: 'item.category', label: 'Category', group: 'Item Master', defaultRequired: false },
  { key: 'item.code', label: 'Code / HSN', group: 'Item Master', defaultRequired: false },
  { key: 'item.reorder', label: 'Reorder / low-stock level', group: 'Item Master', defaultRequired: false },

  // ---- Inward ----
  { key: 'inward.invNo', label: 'Invoice number', group: 'Inward', defaultRequired: false },
  { key: 'inward.invDate', label: 'Invoice date', group: 'Inward', defaultRequired: false },
  { key: 'inward.deliveryType', label: 'Delivery type', group: 'Inward', defaultRequired: false },
  { key: 'inward.transporter', label: 'Transporter', group: 'Inward', defaultRequired: false },
  { key: 'inward.handlingAgent', label: 'Handling agent', group: 'Inward', defaultRequired: false },
  { key: 'inward.vehicle', label: 'Vehicle / LR no.', group: 'Inward', defaultRequired: false },
  { key: 'inward.note', label: 'Note', group: 'Inward', defaultRequired: false },

  // ---- Outward / Order ----
  { key: 'outward.invNo', label: 'Invoice number', group: 'Outward / Order', defaultRequired: false },
  { key: 'outward.transporter', label: 'Transporter', group: 'Outward / Order', defaultRequired: false },
  { key: 'outward.handlingAgent', label: 'Handling agent', group: 'Outward / Order', defaultRequired: false },
  { key: 'outward.note', label: 'Note', group: 'Outward / Order', defaultRequired: false },

  // ---- Payments ----
  { key: 'payment.note', label: 'Note', group: 'Payments', defaultRequired: false },

  // ---- Order taking (behavioural toggle, not a "required field") ----
  // ON  = every sales person can see & take orders for every party.
  // OFF (default) = a sales person is limited to their own assigned parties.
  { key: SALES_SEE_ALL_PARTIES, label: 'Every sales person can see & take orders for every party', group: 'Order taking', defaultRequired: false },
];

export type FieldSettingsMap = Record<string, boolean>;

/** Merge stored overrides on top of the defaults so every key always has a value. */
export function effectiveFieldSettings(overrides: FieldSettingsMap): FieldSettingsMap {
  const out: FieldSettingsMap = {};
  for (const d of FIELD_SETTINGS) out[d.key] = d.key in overrides ? overrides[d.key] : d.defaultRequired;
  return out;
}
