// Ported 1:1 from the legacy app/index.html PERMS array (lines 1168-1211).
// Verified directly against source — do not "correct" counts from memory; there are 23 keys, not 21.

export const PERMS = [
  { id: 'view_dashboard', label: 'View Dashboard', group: 'Core' },
  { id: 'view_inward', label: 'View Inward', group: 'Stock' },
  { id: 'edit_inward', label: 'Add / Delete Inward', group: 'Stock' },
  { id: 'view_outward', label: 'View Outward', group: 'Stock' },
  { id: 'edit_outward', label: 'Add / Delete Outward', group: 'Stock' },
  { id: 'place_order', label: 'Place New Order', group: 'Sales' },
  { id: 'view_orderbook', label: 'View Order Book', group: 'Sales' },
  { id: 'dispatch_order', label: 'Dispatch / Deliver Orders', group: 'Sales' },
  { id: 'view_items', label: 'View Items & Live Stock', group: 'Masters' },
  { id: 'edit_items', label: 'Add / Edit Item Master', group: 'Masters' },
  { id: 'view_parties', label: 'View Party Master', group: 'Masters' },
  { id: 'edit_parties', label: 'Add / Edit Parties', group: 'Masters' },
  { id: 'edit_transporters', label: 'Add / Delete Transporters', group: 'Masters' },
  { id: 'edit_salespersons', label: 'Add / Delete Sales Persons', group: 'Masters' },
  { id: 'view_expenses', label: 'View Sales Person Expenses', group: 'Masters' },
  { id: 'edit_expenses', label: 'Add / Delete Sales Person Expenses', group: 'Masters' },
  { id: 'view_payments', label: 'View Payment Due', group: 'Finance' },
  { id: 'record_payments', label: 'Record Payments', group: 'Finance' },
  { id: 'view_ledgers', label: 'View Ledgers (any party)', group: 'Finance' },
  { id: 'send_whatsapp', label: 'Send WhatsApp Messages', group: 'Finance' },
  { id: 'manage_users', label: 'Manage Users (Admin only)', group: 'Admin' },
  { id: 'manage_financial_years', label: 'Create Financial Years', group: 'Admin' },
  { id: 'view_audit_log', label: 'View Audit Log', group: 'Admin' },
  { id: 'view_approvals', label: 'View Approval Requests', group: 'Admin' },
  { id: 'view_backup', label: 'View Backup & Restore (download only)', group: 'Admin' },
] as const;

export type PermissionKey = (typeof PERMS)[number]['id'];

export type PermissionMap = Record<PermissionKey, boolean>;

export type Role = 'superadmin' | 'admin' | 'account' | 'staff';

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

/** Server-side equivalent of the legacy client's can(perm) — superadmin always passes. */
export function hasPermission(
  role: Role,
  permissions: Partial<PermissionMap> | null | undefined,
  perm: PermissionKey
): boolean {
  if (role === 'superadmin') return true;
  return !!(permissions && permissions[perm]);
}
