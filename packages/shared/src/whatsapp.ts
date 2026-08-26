// WhatsApp message templates — customizable text sent via wa.me share links.
// Each template is a flat string with {token} placeholders filled in at send time.

export type WhatsappTemplateKey =
  | 'orderSlip'
  | 'orderDispatched'
  | 'paymentReminder'
  | 'locationShare'
  | 'dashboardSummary'
  | 'ledgerStatement';

export interface WhatsappPlaceholder {
  token: string;
  description: string;
}

export interface WhatsappTemplateDef {
  key: WhatsappTemplateKey;
  label: string;
  description: string;
  placeholders: WhatsappPlaceholder[];
  default: string;
}

export const WHATSAPP_TEMPLATES: WhatsappTemplateDef[] = [
  {
    key: 'orderSlip',
    label: 'Order Confirmation',
    description: 'Sent to the party from the Order Book when you share an order.',
    placeholders: [
      { token: '{partyName}', description: 'Party name' },
      { token: '{itemName}', description: 'Item name' },
      { token: '{qty}', description: 'Quantity' },
      { token: '{unit}', description: 'Unit (KG / MT / pcs)' },
      { token: '{rate}', description: 'Rate per unit' },
      { token: '{amount}', description: 'Total order amount' },
      { token: '{date}', description: 'Order date' },
      { token: '{invNo}', description: 'Invoice number (or N/A)' },
      { token: '{deliveryTerms}', description: 'Delivery terms (Ex-Works / FOR)' },
      { token: '{deliveryDate}', description: 'Delivery date (or N/A)' },
      { token: '{payStatus}', description: 'Payment status (Pending / Received / Credit)' },
      { token: '{dueDays}', description: 'Credit period in days, e.g. "10 days" (or N/A)' },
      { token: '{dueDate}', description: 'Payment due date (or N/A) — kept for older templates' },
    ],
    default: [
      '📦 *ORDER CONFIRMATION*',
      '',
      '*Surani and Sons*',
      '',
      'Date: {date}',
      '',
      '*Party:* {partyName}',
      '',
      '*Item:* {itemName}',
      '*Quantity:* {qty} {unit}',
      '*Rate:* ₹{rate} per unit',
      '*Total Amount:* ₹{amount}',
      '*Invoice No.:* {invNo}',
      '*Delivery Terms:* {deliveryTerms}',
      '*Delivery Date:* {deliveryDate}',
      '',
      '*Payment Status:* {payStatus}',
      '*Due Days:* {dueDays}',
      '',
      'Thank you for your valued business 🙏',
    ].join('\n'),
  },
  {
    key: 'orderDispatched',
    label: 'Order On The Way',
    description: 'Sent to the party from the Order Book when you click the WhatsApp button (order dispatched / on the way).',
    placeholders: [
      { token: '{partyName}', description: 'Party name' },
      { token: '{itemName}', description: 'Item name' },
      { token: '{qty}', description: 'Quantity' },
      { token: '{unit}', description: 'Unit (KG / MT / pcs)' },
      { token: '{invNo}', description: 'Invoice number (or N/A)' },
      { token: '{date}', description: 'Order date' },
      { token: '{transporter}', description: 'Transporter name (or N/A)' },
      { token: '{vehicle}', description: 'Vehicle / LR number (or N/A)' },
    ],
    default: [
      '🚚 *YOUR ORDER IS ON THE WAY!*',
      '',
      '*Surani and Sons*',
      '',
      'Dear {partyName},',
      '',
      'Good news — your order has been dispatched and is on its way to you. 🎉',
      '',
      '*Item:* {itemName}',
      '*Quantity:* {qty} {unit}',
      '*Invoice No.:* {invNo}',
      '*Order Date:* {date}',
      '*Transporter:* {transporter}',
      '*Vehicle / LR No.:* {vehicle}',
      '',
      'We will keep you updated. Thank you for your valued business 🙏',
    ].join('\n'),
  },
  {
    key: 'paymentReminder',
    label: 'Payment Reminder',
    description: 'Sent to a party from the Payment Due page to remind them of an outstanding balance.',
    placeholders: [
      { token: '{partyName}', description: 'Party name' },
      { token: '{balance}', description: 'Total outstanding balance' },
      { token: '{overdueCount}', description: 'Number of overdue invoices' },
      { token: '{overdueAmount}', description: 'Total overdue amount' },
      { token: '{invoiceList}', description: 'Itemised list of outstanding invoices — number, date, amount (filled in automatically)' },
      { token: '{date}', description: "Today's date" },
    ],
    default: [
      '💰 *PAYMENT REMINDER*',
      '',
      'Dear {partyName},',
      '',
      'This is a gentle reminder that you have an outstanding balance of ₹{balance} with Surani and Sons as on {date}.',
      '',
      '{overdueCount} invoice(s) totalling ₹{overdueAmount} are overdue.',
      '',
      '*Outstanding invoices:*',
      '{invoiceList}',
      '',
      'Kindly arrange payment at the earliest. Thank you 🙏',
    ].join('\n'),
  },
  {
    key: 'locationShare',
    label: 'Delivery Location (to Transporter)',
    description: 'Sent to the transporter from the Order Book after an order is dispatched, sharing the delivery party’s location.',
    placeholders: [
      { token: '{transporterName}', description: 'Transporter name' },
      { token: '{partyName}', description: 'Delivery party name' },
      { token: '{partyPhone}', description: 'Delivery party phone (or N/A)' },
      { token: '{partyAddress}', description: 'Delivery party address (or N/A)' },
      { token: '{locationUrl}', description: 'Delivery location link (or N/A)' },
      { token: '{vehicle}', description: 'Vehicle number (or N/A)' },
    ],
    default: [
      '🚚 *DELIVERY LOCATION*',
      '',
      'Respected {transporterName},',
      '',
      'Please find below the delivery details for the consignment.',
      '',
      '*Delivery Party:* {partyName}',
      '*Phone:* {partyPhone}',
      '*Address:* {partyAddress}',
      '*Vehicle:* {vehicle}',
      '',
      '*Location:* {locationUrl}',
      '',
      'Please proceed accordingly. Thank you 🙏',
    ].join('\n'),
  },
  {
    key: 'dashboardSummary',
    label: 'Daily Business Summary',
    description: 'Sent from the Dashboard to share a snapshot of the business position.',
    placeholders: [
      { token: '{date}', description: "Today's date" },
      { token: '{receivable}', description: 'Total receivable' },
      { token: '{payable}', description: 'Total payable' },
      { token: '{netPosition}', description: 'Net position (receivable minus payable)' },
      { token: '{lowStockCount}', description: 'Number of low-stock items' },
      { token: '{pendingOrders}', description: 'Number of pending orders' },
    ],
    default: [
      '📊 *DAILY BUSINESS SUMMARY*',
      '',
      '*Surani and Sons*',
      '📅 {date}',
      '',
      '💵 Receivable: ₹{receivable}',
      '💸 Payable: ₹{payable}',
      '📈 Net Position: ₹{netPosition}',
      '',
      '📦 Low stock items: {lowStockCount}',
      '⏳ Pending orders: {pendingOrders}',
    ].join('\n'),
  },
  {
    key: 'ledgerStatement',
    label: 'Statement of Account (Ledger)',
    description: 'Sent to a party from their Ledger page, sharing a full statement of account.',
    placeholders: [
      { token: '{partyName}', description: 'Party name' },
      { token: '{date}', description: "Today's date" },
      { token: '{lines}', description: 'The list of ledger transactions (filled in automatically)' },
      { token: '{closingBalance}', description: 'Closing balance (Dr/Cr)' },
    ],
    default: [
      '🧾 *STATEMENT OF ACCOUNT*',
      '',
      '*Surani and Sons*',
      '',
      '👤 *{partyName}*',
      '📅 As on: {date}',
      '',
      '{lines}',
      '',
      '*Closing Balance: {closingBalance}*',
      '',
      'Thank you for your valued business 🙏',
    ].join('\n'),
  },
];

/** Human label for an order's delivery terms, used in the order-confirmation message. */
export function deliveryTermsLabel(deliveryType: string | null | undefined): string {
  if (deliveryType === 'ExWorks') return 'Ex-Works';
  if (deliveryType === 'FOR') return 'FOR';
  return deliveryType || 'N/A';
}

export function defaultWhatsappTemplate(key: WhatsappTemplateKey): string {
  return WHATSAPP_TEMPLATES.find((t) => t.key === key)!.default;
}

/** Replaces {token} placeholders with values from `vars`. Unknown tokens are left as-is. */
export function fillWhatsappTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

/** Builds a wa.me share link. Falls back to the phone-less share sheet if no usable phone is given. */
export function buildWhatsappLink(phone: string | null | undefined, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const base = digits.length > 7 ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds a `tel:` link with a proper leading `+` so the country code is dialled correctly.
 * Without the `+`, a number like `919876543210` is treated as a local number, not +91 India.
 * - Already starts with `+` → kept as-is (any country).
 * - Exactly 10 digits → assumed Indian mobile, gets `+91`.
 * - Anything else with digits → gets a leading `+` (e.g. `91XXXXXXXXXX` → `+91XXXXXXXXXX`).
 */
export function buildTelLink(phone: string | null | undefined): string {
  const raw = (phone || '').trim();
  if (raw.startsWith('+')) return `tel:+${raw.slice(1).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 'tel:';
  if (digits.length === 10) return `tel:+91${digits}`;
  return `tel:+${digits}`;
}
