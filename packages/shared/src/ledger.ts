// Imported ledger / pending bills (Option A) are stored as ordinary pending sales invoices so they
// flow through Payment Due and payment settlement natively — but they carry no real material. They
// are all booked against this one hidden placeholder item (quantity 1, rate = the bill amount, so the
// invoice amount is exact). The UI hides this item from stock views and item pickers by matching its
// name, so it never pollutes stock or sales selection.
export const OPENING_BALANCE_ITEM_NAME = 'Opening Balance (ledger)';

/** True for the hidden placeholder item used by ledger imports — filter these out of item lists. */
export function isOpeningBalanceItem(item: { name: string }): boolean {
  return item.name === OPENING_BALANCE_ITEM_NAME;
}
