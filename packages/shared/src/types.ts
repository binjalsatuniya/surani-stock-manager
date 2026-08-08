import type { PermissionMap, Role } from './permissions';
import type { NotifyPrefs } from './notifications';

export interface UserSecurity {
  pinEnabled: boolean;
  pinHash: string | null;
  biometricEnabled: boolean;
  biometricCredentialId: string | null;
  // Whether the primary Super Admin has set the extra password that gates viewing Login Locations.
  locationAccessEnabled?: boolean;
}

// Per-user UI preferences saved server-side so they follow the user across devices.
export interface UserPreferences {
  dashboard?: {
    tiles?: string[]; // ordered tile keys (web)
    sections?: string[]; // ordered section keys (web)
  };
  menuOrder?: string[]; // ordered sidebar nav keys (web)
  mobileMenuOrder?: string[]; // ordered "More" menu keys (mobile)
  mobileDashboard?: {
    tiles?: string[]; // ordered tile keys (mobile)
    sections?: string[]; // ordered section keys (mobile)
  };
  // Which business activities send this user a phone push notification (admin-managed).
  notify?: NotifyPrefs;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  permissions: PermissionMap;
  security: UserSecurity;
  preferences: UserPreferences;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PartyType = 'debtor' | 'creditor' | 'both' | 'transporter' | 'handling';

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  salesPersonId: string | null;
  phone: string | null;
  email: string | null;
  gst: string | null;
  opening: number;
  creditDays: number;
  defaultFreight: number;
  address: string | null;
  locationUrl: string | null;
  vehicle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesPerson {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
}

export interface LoginLocation {
  id: string;
  userId: string;
  userName: string;
  username: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  createdAt: string;
}

export interface SalesPersonExpense {
  id: string;
  salesPersonId: string;
  date: string;
  amount: number;
  expenseFor: string;
  attachment: string | null; // data: URL (base64) of the attached invoice, or null
  attachmentName: string | null;
  paid: boolean; // reimbursed to the sales person?
  paidAt: string | null;
  paidBy: string | null; // who paid it
  paidMode: string | null; // Cash / bank account used
  createdAt: string;
}

export type ItemUnit = 'KG' | 'MT' | 'pcs';

export interface Item {
  id: string;
  name: string;
  category: string | null;
  unit: ItemUnit;
  code: string | null; // HSN code
  gstPct: number; // default GST slab for this item
  rate: number;
  opening: number;
  reorder: number;
  rateDate: string | null;
  tdsAttachment: string | null; // Technical Data Sheet file as a base64 data URL
  tdsAttachmentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryType = 'ExWorks' | 'FOR';

export type InwardStatus = 'pending' | 'received';

export interface Inward {
  id: string;
  date: string;
  financialYear: string;
  status: InwardStatus;
  partyId: string;
  itemId: string;
  qty: number;
  rate: number;
  gstPct: number;
  gst: number;
  handlingRate: number;
  handling: number;
  handlingAgentId: string | null;
  amount: number;
  invNo: string | null;
  invDate: string | null;
  deliveryType: DeliveryType | null;
  transporterId: string | null;
  freightRate: number;
  freight: number;
  vehicle: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PayStatus = 'pending' | 'received' | 'credit';
export type FulfilStatus = 'pending' | 'dispatched' | 'delivered' | 'cancelled';

export interface Outward {
  id: string;
  date: string;
  financialYear: string;
  partyId: string;
  itemId: string;
  qty: number;
  rate: number;
  freightRate: number;
  freight: number;
  gstPct: number;
  gst: number;
  handlingRate: number;
  handling: number;
  handlingAgentId: string | null;
  amount: number;
  payStatus: PayStatus;
  creditDays: number;
  invNo: string | null;
  invDate: string | null;
  deliveryType: DeliveryType | null;
  transporterId: string | null;
  vehicle: string | null;
  fulfil: FulfilStatus;
  prevFulfil: FulfilStatus | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveryDate: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelNote: string | null;
  invoiceFile: string | null;
  invoiceFileName: string | null;
  // Resolved names embedded by the server (Order Book list) so screens can show them without
  // loading the permission-gated Parties/Items lists. Optional — other endpoints may omit them.
  partyName?: string | null;
  itemName?: string | null;
  transporterName?: string | null;
  handlingAgentName?: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentDirection = 'in' | 'out';
export type PaymentMode = 'Cash' | 'HDFC CRAC' | 'ICICI CRAC' | 'ICICI CCAC' | 'KCBL CRAC';
export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'HDFC CRAC', 'ICICI CRAC', 'ICICI CCAC', 'KCBL CRAC'];

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  outwardId: string;
  amount: number;
}

export interface Payment {
  id: string;
  date: string;
  financialYear: string;
  partyId: string;
  dir: PaymentDirection;
  amount: number; // cash that actually changed hands
  tdsAmount: number; // TDS deducted at source; invoices/ledger settle by (amount + tdsAmount)
  mode: PaymentMode;
  allocations: PaymentAllocation[];
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface FreightEntry {
  id: string;
  date: string;
  transporterId: string;
  partyId: string;
  itemId: string;
  qty: number;
  freight: number;
  freightRate: number;
  inwardId: string | null;
  outwardId: string | null;
  invNo: string | null;
  note: string | null;
  createdAt: string;
}

export type LedgerSourceKind = 'inward' | 'outward';

export interface HandlingEntry {
  id: string;
  date: string;
  handlingAgentId: string;
  partyId: string;
  itemId: string;
  qty: number;
  amount: number;
  handlingRate: number;
  sourceId: string;
  sourceKind: LedgerSourceKind;
  invNo: string | null;
  note: string | null;
  createdAt: string;
}

export type ApprovalKind = 'edit' | 'delete' | 'reset';
export type ApprovalTarget = 'inward' | 'outward' | 'payment' | 'party' | 'item' | 'all' | 'user';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  target: ApprovalTarget;
  targetId: string;
  payload: Record<string, unknown>;
  label: string;
  status: ApprovalStatus;
  requestedBy: string;
  resolvedBy: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target: string;
  targetId: string | null;
  label: string | null;
  details: Record<string, unknown> | null;
  actorId: string | null;
  actorName: string;
  timestamp: string;
  // Whether this edit/delete can be undone (has a saved snapshot and isn't reversed yet).
  reversible?: boolean;
  reversed?: boolean;
}

export interface FinancialYear {
  label: string;
  createdBy: string | null;
  createdAt: string;
}
