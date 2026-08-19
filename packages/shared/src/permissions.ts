// Ported 1:1 from the legacy app/index.html PERMS array (lines 1168-1211).
// Verified directly against source — do not "correct" counts from memory; there are 23 keys, not 21.

export const PERMS = [
  { id: 'view_dashboard', label: 'View Dashboard', group: 'Core' },
  { id: 'view_shortcuts', label: 'See Shortcuts page', group: 'Core' },
  { id: 'edit_shortcuts', label: 'Edit Shortcuts (change keys / toggles)', group: 'Core' },

  { id: 'view_inward', label: 'View Inward', group: 'Inward' },
  { id: 'add_inward', label: 'Add Inward', group: 'Inward' },
  { id: 'edit_inward', label: 'Edit Inward', group: 'Inward' },
  { id: 'delete_inward', label: 'Delete Inward', group: 'Inward' },

  { id: 'view_outward', label: 'View Outward', group: 'Outward' },
  { id: 'add_outward', label: 'Add Outward', group: 'Outward' },
  { id: 'edit_outward', label: 'Edit Outward', group: 'Outward' },
  { id: 'delete_outward', label: 'Delete Outward', group: 'Outward' },
  { id: 'edit_outward_freight', label: 'Edit Freight / Handling on Outward', group: 'Outward' },

  { id: 'place_order', label: 'Place New Order', group: 'Sales' },
  { id: 'view_orderbook', label: 'View Order Book', group: 'Sales' },
  { id: 'view_order_rate', label: 'See Sale Rate & Amount (Order Book)', group: 'Sales' },
  { id: 'dispatch_order', label: 'Dispatch / Deliver Orders', group: 'Sales' },
  { id: 'view_invoice', label: 'See attached Invoice PDF', group: 'Sales' },

  { id: 'view_items', label: 'View Items & Live Stock', group: 'Item Master' },
  { id: 'view_live_stock', label: 'See Live Stock & Rate tab', group: 'Item Master' },
  { id: 'edit_rate', label: 'Update Live Stock Rate', group: 'Item Master' },
  { id: 'add_items', label: 'Add Items', group: 'Item Master' },
  { id: 'edit_items', label: 'Edit Items', group: 'Item Master' },
  { id: 'delete_items', label: 'Delete Items', group: 'Item Master' },

  { id: 'view_parties', label: 'View Party Master', group: 'Party Master' },
  { id: 'use_gst_lookup', label: 'Fetch party details from GST number', group: 'Party Master' },
  { id: 'add_parties', label: 'Add Parties', group: 'Party Master' },
  { id: 'edit_parties', label: 'Edit Parties', group: 'Party Master' },
  { id: 'delete_parties', label: 'Delete Parties', group: 'Party Master' },
  { id: 'edit_transporters', label: 'Add / Edit / Delete Transporters', group: 'Party Master' },
  { id: 'edit_salespersons', label: 'Add / Edit / Delete Sales Persons', group: 'Party Master' },

  { id: 'view_expenses', label: 'View Expenses', group: 'Expenses' },
  { id: 'add_expenses', label: 'Add Expenses', group: 'Expenses' },
  { id: 'edit_expenses', label: 'Edit / Mark-paid Expenses', group: 'Expenses' },
  { id: 'delete_expenses', label: 'Delete Expenses', group: 'Expenses' },
  { id: 'manage_expense_trips', label: 'Create / delete Expense Trips', group: 'Expenses' },

  { id: 'view_payments', label: 'View Payment Due', group: 'Finance' },
  { id: 'record_payments', label: 'Add Payments', group: 'Finance' },
  { id: 'delete_payments', label: 'Delete Payments', group: 'Finance' },
  { id: 'view_ledgers', label: 'View Ledgers (any party)', group: 'Finance' },

  { id: 'view_whatsapp', label: 'See WhatsApp Messages tab', group: 'WhatsApp' },
  { id: 'send_whatsapp', label: 'Send WhatsApp Messages', group: 'WhatsApp' },

  { id: 'view_import_scans', label: 'See Import from Scans page', group: 'Admin' },
  { id: 'import_invoices', label: 'Import scanned invoices (creates sales entries)', group: 'Admin' },

  { id: 'manage_users', label: 'See User Master', group: 'Admin' },
  { id: 'create_users', label: 'Create New Users', group: 'Admin' },
  { id: 'manage_roles', label: 'Create Roles & set their permissions', group: 'Admin' },
  { id: 'view_field_rules', label: 'See Field Rules tab', group: 'Admin' },
  { id: 'manage_financial_years', label: 'Create Financial Years', group: 'Admin' },
  { id: 'view_audit_log', label: 'View Audit Log', group: 'Admin' },
  { id: 'view_approvals', label: 'View Approval Requests', group: 'Admin' },
  { id: 'view_backup', label: 'View Backup & Restore', group: 'Admin' },
] as const;

export type PermissionKey = (typeof PERMS)[number]['id'];

// New granular keys fall back to the old combined key when not explicitly set, so existing users
// keep exactly the access they had before the split (no data migration needed).
//
// NOTE: keys for genuinely NEW features are deliberately left out of this map. Without a fallback
// they resolve to false for everyone whose stored permissions predate them, so a new feature is
// invisible until an admin grants it — only superadmin sees it straight away. That is intentional:
// a new capability should be reviewed before staff can reach it, not arrive switched on.
const LEGACY_FALLBACK: Partial<Record<PermissionKey, PermissionKey>> = {
  add_inward: 'edit_inward',
  delete_inward: 'edit_inward',
  add_outward: 'edit_outward',
  delete_outward: 'edit_outward',
  add_items: 'edit_items',
  delete_items: 'edit_items',
  add_parties: 'edit_parties',
  delete_parties: 'edit_parties',
  add_expenses: 'edit_expenses',
  delete_expenses: 'edit_expenses',
  delete_payments: 'record_payments',
  view_whatsapp: 'send_whatsapp',
  view_field_rules: 'manage_users',
  view_live_stock: 'view_items',
  // Updating the rate used to require edit_items; keep that access for existing users.
  edit_rate: 'edit_items',
  // Seeing the attached invoice defaults to anyone who can view the Order Book, until restricted.
  view_invoice: 'view_orderbook',
  // New: anyone who can view the Order Book keeps seeing the rate/amount until an admin turns it
  // off for a specific user (so existing users are unaffected).
  view_order_rate: 'view_orderbook',
  // Shortcuts page defaults to visible (falls back to Dashboard access) until an admin turns it off.
  view_shortcuts: 'view_dashboard',
  // Editing the shortcuts defaults to allowed for anyone who can see them, until an admin restricts it.
  edit_shortcuts: 'view_shortcuts',
};

export type PermissionMap = Record<PermissionKey, boolean>;

/**
 * What a user can actually do: their role's permissions, with their own exceptions applied on top.
 *
 * Editing a role therefore reaches everyone on it immediately, while anything granted or withdrawn
 * for one person individually survives that change — it is recorded against them, not inherited.
 *
 * `overrides` holds only the keys that deviate. An absent key means "whatever the role says", which
 * is what makes role edits propagate at all: a full copy per user would leave nothing to inherit.
 */
export function resolvePermissions(
  rolePerms: Partial<PermissionMap> | null | undefined,
  overrides: Partial<PermissionMap> | null | undefined
): PermissionMap {
  const out = {} as PermissionMap;
  for (const p of PERMS) {
    const own = overrides?.[p.id];
    out[p.id] = typeof own === 'boolean' ? own : !!rolePerms?.[p.id];
  }
  return out;
}

/**
 * Reduce a full permission map to just the keys that differ from the role — used once, to convert
 * existing users without changing anyone's access on the day.
 */
export function diffFromRole(
  rolePerms: Partial<PermissionMap> | null | undefined,
  effective: Partial<PermissionMap> | null | undefined
): Partial<PermissionMap> {
  const out: Partial<PermissionMap> = {};
  for (const p of PERMS) {
    const want = !!effective?.[p.id];
    if (want !== !!rolePerms?.[p.id]) out[p.id] = want;
  }
  return out;
}

/**
 * The four built-in roles carry behaviour: superadmin bypasses every permission check, and an
 * admin's changes are queued for approval. Custom roles created in Role Master are ordinary users
 * — they are permission templates with a name, so any string is a valid role.
 */
export const BUILT_IN_ROLES = ['superadmin', 'admin', 'account', 'staff'] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];
// `string & {}` keeps editor suggestions for the built-ins while still accepting a custom name.
export type Role = BuiltInRole | (string & {});

/**
 * Display label for a user's role: Account / Staff show as-is; both superadmin and admin
 * display as "Admin" (the primary Super Admin isn't singled out in the UI).
 */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'superadmin':
      return 'Admin';
    case 'admin':
      return 'Admin';
    case 'account':
      return 'Account';
    case 'staff':
      return 'Staff';
    default:
      return role;
  }
}

export function allPermissionsTrue(): PermissionMap {
  return PERMS.reduce((o, p) => {
    o[p.id] = true;
    return o;
  }, {} as PermissionMap);
}

function allFalse(): PermissionMap {
  return PERMS.reduce((o, p) => {
    o[p.id] = false;
    return o;
  }, {} as PermissionMap);
}

/**
 * Default permission bag for a newly created user of a given role.
 * Ported 1:1 from defaultPermsForRole() in the legacy app (index.html:1194).
 * Note: 'admin' defaults to ALL permissions true — the admin/superadmin split is
 * NOT about which permissions they hold, it's about the approval-gate behavior
 * (admin mutations get queued for superadmin approval; superadmin executes immediately).
 */
export function defaultPermsForRole(role: Role): PermissionMap {
  if (role === 'admin' || role === 'superadmin') return allPermissionsTrue();
  if (role === 'account') {
    const o = allFalse();
    (
      [
        'view_dashboard',
        'view_outward',
        'view_orderbook',
        'view_items',
        'view_parties',
        'view_payments',
        'record_payments',
        'view_ledgers',
        'send_whatsapp',
      ] as PermissionKey[]
    ).forEach((k) => (o[k] = true));
    return o;
  }
  if (role === 'staff') {
    // staff: view stock + place/dispatch orders
    const o = allFalse();
    (
      [
        'view_dashboard',
        'view_inward',
        'view_outward',
        'view_orderbook',
        'view_items',
        'view_parties',
        'place_order',
        'dispatch_order',
      ] as PermissionKey[]
    ).forEach((k) => (o[k] = true));
    return o;
  }
  // A custom role starts with nothing — its own template is applied by the caller, which reads it
  // from Role Master. Falling through to the staff set would hand out access nobody chose.
  return allFalse();
}

/**
 * can(perm) — superadmin always passes. For a granular key that isn't explicitly set on the user,
 * fall back to the old combined key (so pre-split users keep their access until an admin edits them).
 */
export function hasPermission(
  role: Role,
  permissions: Partial<PermissionMap> | null | undefined,
  perm: PermissionKey
): boolean {
  if (role === 'superadmin') return true;
  if (!permissions) return false;
  const direct = permissions[perm];
  if (typeof direct === 'boolean') return direct;
  const fb = LEGACY_FALLBACK[perm];
  if (fb && typeof permissions[fb] === 'boolean') return !!permissions[fb];
  return false;
}
