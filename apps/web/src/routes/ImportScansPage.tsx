import { Fragment, useEffect, useState } from 'react';
import type { Item, Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { readScannedInvoice, type ScannedInvoice, type ScannedLine } from '../lib/invoiceImport';
import { SearchSelect } from '../components/SearchSelect';

/**
 * Reads a pile of scanned sales invoices and shows what it found, so old records can be entered
 * without typing every field.
 *
 * The invoice number, date, party and total come from the signed e-Invoice QR and are exact.
 * The goods lines (item, quantity, rate) are read by OCR, which guesses — and on a busy invoice
 * often misses lines or misreads a figure. So the review table is EDITABLE: the read is a draft,
 * and a person fixes what OCR got wrong (pick the item, correct qty/rate, add a missing line, or
 * choose the party) until the lines reconcile with the QR total. Only then can a row be imported.
 */

interface Row extends ScannedInvoice {
  party: Party | null;
  /** One matched item per goods line, in the same order; null where none is chosen yet. */
  items: (Item | null)[];
  /**
   * Per line: has a human confirmed the item? An HSN code is shared by many grades, so a match on
   * HSN alone is only a guess and may be the wrong material. It stays unconfirmed (shown "check")
   * until the item is chosen in the Edit panel — which is also why nothing is ticked automatically.
   */
  confirmed: boolean[];
  /** True once the invoice number is known to already exist (or repeats within this batch). */
  duplicate: boolean;
  duplicateNote?: string;
  selected: boolean;
  outcome: 'imported' | 'skipped' | 'failed' | null;
  outcomeNote?: string;
}

const GST_SLABS = [0, 5, 12, 18, 28];
const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** The taxable value of a line — quantity × rate — or 0 until both are entered. */
const lineValue = (l: ScannedLine) => (l.qty != null && l.rate != null ? l.qty * l.rate : 0);

/**
 * Reconcile the goods lines against the QR total, which is exact. The gap between the goods total
 * and the QR total, expressed as a percentage, should land on a standard GST slab; if it does, the
 * figures agree and that slab is the invoice's GST rate.
 */
function reconcile(qrTotal: number | null | undefined, lines: ScannedLine[]) {
  const goodsTotal = lines.reduce((s, l) => s + lineValue(l), 0);
  if (qrTotal == null || goodsTotal <= 0) return { impliedGstPct: null as number | null, matchesQrTotal: false, goodsTotal };
  const pct = ((qrTotal - goodsTotal) / goodsTotal) * 100;
  const slab = GST_SLABS.find((s) => Math.abs(pct - s) < 0.6);
  return { impliedGstPct: slab ?? Math.round(pct * 100) / 100, matchesQrTotal: slab != null, goodsTotal };
}

/** Rebuild the plain-English list of what still stops this row from importing. */
function buildProblems(r: Row, goodsTotal: number): string[] {
  const p: string[] = [];
  if (!r.qr) p.push('No e-Invoice QR found — the invoice number, date and total cannot be trusted, so this cannot be imported.');
  if (r.duplicateNote) p.push(r.duplicateNote);
  if (!r.party) {
    p.push(
      r.qr?.buyerGstin
        ? `No party in your list has GSTIN ${r.qr.buyerGstin} — pick the party below, or add it in Party Master.`
        : 'Pick the party for this invoice below.'
    );
  }
  if (r.lines.length === 0) {
    p.push('No goods line read — add each item below, with its quantity and rate.');
  } else {
    if (r.lines.some((l, i) => !r.items[i])) p.push('Pick the item for every goods line below.');
    if (r.lines.some((l) => l.qty == null || l.rate == null)) p.push('Enter a quantity and rate on every goods line below.');
    else if (r.qr?.totalValue != null && !r.matchesQrTotal) {
      p.push(
        `The goods lines total ₹${goodsTotal.toLocaleString('en-IN')}, which plus GST does not reach the ` +
          `invoice total ₹${r.qr.totalValue.toLocaleString('en-IN')} at any standard rate — check the quantities, ` +
          `rates, and whether a line is missing.`
      );
    }
  }
  return p;
}

/** Refresh a row's derived fields (implied GST, reconciliation, problems) after any edit. */
function recompute(r: Row): Row {
  const { impliedGstPct, matchesQrTotal, goodsTotal } = reconcile(r.qr?.totalValue, r.lines);
  const withDerived = { ...r, impliedGstPct, matchesQrTotal };
  return { ...withDerived, problems: buildProblems(withDerived, goodsTotal) };
}

const toNum = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function ImportScansPage() {
  const can = usePermission();
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Existing invoice numbers, so the same sale can never be entered twice.
  const [existingInvNos, setExistingInvNos] = useState<Set<string>>(new Set());

  async function loadExistingInvoices() {
    const all = await api.outward.list();
    setExistingInvNos(new Set(all.map((o) => (o.invNo || '').trim().toUpperCase()).filter(Boolean)));
  }

  useEffect(() => {
    api.parties.list().then(setParties);
    api.items.list().then(setItems);
    loadExistingInvoices();
  }, []);

  const normGst = (g: string | null | undefined) => (g || '').replace(/\s/g, '').toUpperCase();

  /**
   * An item's Code field may list more than one HSN — the same product is sometimes invoiced under
   * two codes. They are separated by a comma (or slash/semicolon), and a match on any one counts.
   */
  const hsnCodesOf = (code: string | null | undefined) =>
    (code || '')
      .split(/[,/;|]+/)
      .map((c) => c.replace(/\s/g, ''))
      .filter(Boolean);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setRows([]);
    setEditingIndex(null);
    setProgress({ done: 0, total: files.length });
    const out: Row[] = [];
    // One at a time: each file spins up an OCR worker, and running many at once starves the tab.
    for (let i = 0; i < files.length; i++) {
      const scan = await readScannedInvoice(files[i]);
      const buyer = normGst(scan.qr?.buyerGstin);
      const party = buyer ? parties.find((p) => normGst(p.gst) === buyer) ?? null : null;
      const matched = scan.lines.map((l) => (l.hsn ? items.find((it) => hsnCodesOf(it.code).includes(l.hsn!)) ?? null : null));
      const invNo = (scan.qr?.docNo || '').trim().toUpperCase();
      // Duplicate against what is already saved, AND against earlier files in this same batch —
      // selecting the same invoice twice in one go would otherwise import it twice.
      const alreadySaved = !!invNo && existingInvNos.has(invNo);
      const earlierInBatch = !!invNo && out.some((p) => (p.qr?.docNo || '').trim().toUpperCase() === invNo);
      const duplicate = alreadySaved || earlierInBatch;
      const duplicateNote = alreadySaved
        ? 'This invoice number is already in the system.'
        : earlierInBatch
          ? 'This invoice appears more than once in the files you selected.'
          : undefined;
      // Build the row, then recompute so its problems reflect the editable review model (the raw
      // OCR problems from the reader are superseded — a person can now fix each of them here).
      // Never tick a row automatically: the item is only an HSN guess and must be eyeballed. The
      // person selects what to import after checking — "Select all ready" is there for a knowing
      // bulk action.
      const row = recompute({
        ...scan,
        party,
        items: matched,
        confirmed: matched.map(() => false),
        duplicate,
        duplicateNote,
        selected: false,
        outcome: null,
      });
      out.push(row);
      setRows([...out]);
      setProgress({ done: i + 1, total: files.length });
    }
    setBusy(false);
  }

  /** A row can only be imported when every piece it needs is present and reconciled. */
  function importable(r: Row): boolean {
    return (
      !r.duplicate &&
      r.outcome !== 'imported' &&
      !!r.party &&
      !!r.qr?.docNo &&
      !!r.qr?.docDate &&
      r.impliedGstPct != null &&
      r.matchesQrTotal &&
      r.lines.length > 0 &&
      // Every line must be complete AND its item confirmed by a person: the item is only guessed
      // from the HSN code, which is shared across grades, so importing on that guess alone would
      // silently record the wrong material. The figures reconciling does not vouch for the item.
      r.lines.every((l, i) => !!r.items[i] && r.confirmed[i] && l.qty != null && l.rate != null)
    );
  }

  // --- Editing the draft --------------------------------------------------------------------
  // Every edit clones the row, applies the change, and recomputes the derived fields and problems,
  // so the reconciliation and the Import checkbox update the moment the figures add up.
  function updateRow(i: number, fn: (r: Row) => void) {
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const draft: Row = { ...r, lines: r.lines.map((l) => ({ ...l })), items: [...r.items], confirmed: [...r.confirmed] };
        fn(draft);
        return recompute(draft);
      })
    );
  }
  const setParty = (i: number, id: string) => updateRow(i, (r) => { r.party = parties.find((p) => p.id === id) ?? null; });
  // Choosing the item by hand is what confirms it — from here on it is a decision, not a guess.
  const setLineItem = (i: number, li: number, id: string) =>
    updateRow(i, (r) => { r.items[li] = items.find((x) => x.id === id) ?? null; r.confirmed[li] = true; });
  // Accept the HSN guess as correct without changing it — for when the matched item is right.
  const confirmLineItem = (i: number, li: number) => updateRow(i, (r) => { if (r.items[li]) r.confirmed[li] = true; });
  const setLineQty = (i: number, li: number, v: string) => updateRow(i, (r) => { r.lines[li].qty = toNum(v); });
  const setLineRate = (i: number, li: number, v: string) => updateRow(i, (r) => { r.lines[li].rate = toNum(v); });
  const addLine = (i: number) =>
    updateRow(i, (r) => {
      r.lines.push({ hsn: null, qty: null, rate: null, amount: null, addsUp: false });
      r.items.push(null);
      r.confirmed.push(false);
    });
  const removeLine = (i: number, li: number) =>
    updateRow(i, (r) => { r.lines.splice(li, 1); r.items.splice(li, 1); r.confirmed.splice(li, 1); });

  async function onImport() {
    const chosen = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.selected && importable(r));
    if (!chosen.length) return;
    setBusy(true);
    setProgress({ done: 0, total: chosen.length });

    const next = [...rows];
    for (let n = 0; n < chosen.length; n++) {
      const { r, i } = chosen[n];
      try {
        // Payment status follows the party's own credit terms, exactly as a normal sale would.
        const creditDays = r.party!.creditDays ?? 0;
        // One entry per goods line, all sharing the invoice number — the shape the rest of the
        // system already expects, since stock and ledgers are read per item.
        for (let li = 0; li < r.lines.length; li++) {
          const line = r.lines[li];
          await api.outward.create({
            date: r.qr!.docDate,
            invDate: r.qr!.docDate,
            partyId: r.party!.id,
            itemId: r.items[li]!.id,
            qty: line.qty!,
            rate: line.rate!,
            gstPct: r.impliedGstPct!,
            invNo: r.qr!.docNo,
            payStatus: creditDays > 0 ? 'credit' : 'pending',
            creditDays,
            fulfil: 'delivered', // these sales already happened
            note: 'Imported from scanned invoice',
          });
        }
        next[i] = { ...next[i], outcome: 'imported', selected: false };
        existingInvNos.add(r.qr!.docNo.trim().toUpperCase());
      } catch (e) {
        next[i] = {
          ...next[i],
          outcome: 'failed',
          outcomeNote: e instanceof Error ? e.message : 'Failed',
        };
      }
      setRows([...next]);
      setProgress({ done: n + 1, total: chosen.length });
    }
    setBusy(false);
  }

  const ready = rows.filter((r) => r.problems.length === 0).length;
  const selectedCount = rows.filter((r) => r.selected && importable(r)).length;
  const importedCount = rows.filter((r) => r.outcome === 'imported').length;
  const duplicateCount = rows.filter((r) => r.duplicate).length;
  const doneCount = rows.filter((r) => r.duplicate || r.outcome === 'imported').length;

  /** Tidy the list down to what still needs attention — nothing is deleted from the database. */
  function clearDuplicates() {
    setEditingIndex(null);
    setRows((rs) => rs.filter((r) => !r.duplicate));
  }
  function clearFinished() {
    setEditingIndex(null);
    setRows((rs) => rs.filter((r) => !r.duplicate && r.outcome !== 'imported'));
  }

  // Seeing the page and actually writing entries are separate rights: someone may be allowed to
  // check what a batch of scans reads as without being allowed to commit it to the books.
  if (!can('view_import_scans')) return <div className="card">You do not have permission to see this page.</div>;
  const canImport = can('import_invoices');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Import from Scans</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Select scanned sales invoices to see what can be read from them. The invoice number, date,
          party and total come from the e-Invoice QR and are exact. Quantity and rate are read off
          the page, and the <strong>item is only guessed from the HSN code</strong> — the same HSN
          covers many grades, so it may be the wrong material and is shown as <strong>“check”</strong>{' '}
          until you confirm it. Use the <strong>Edit</strong> button to confirm the item, correct a
          figure, add a missing line, or choose the party. Nothing is ticked for you: a row is only
          imported once you select it, and only after its lines reconcile with the invoice total.
        </p>
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12.5,
            color: '#92400e',
            marginBottom: 12,
          }}
        >
          Imported invoices are recorded as <strong>delivered</strong> sales, with payment status
          taken from each party's credit terms. An invoice number already in the system is skipped,
          so running the same folder twice cannot double-count anything. <strong>Check a few rows
          against the paper before importing a large batch.</strong>
        </div>
        <input type="file" accept="application/pdf,image/*" multiple disabled={busy} onChange={(e) => onPick(e.target.files)} />
        {busy && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Reading {progress.done} of {progress.total}… (a few seconds each)
          </div>
        )}
        {!busy && rows.length > 0 && (
          <div className="toolbar" style={{ marginTop: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>
              <strong>{ready}</strong> of <strong>{rows.length}</strong> read cleanly
              {duplicateCount > 0 && <> · <strong style={{ color: '#b45309' }}>{duplicateCount} already entered</strong></>}
              {importedCount > 0 && <> · <strong style={{ color: '#15803d' }}>{importedCount} imported</strong></>}
            </span>
            {canImport ? (
              <button className="btn btn-primary" onClick={onImport} disabled={selectedCount === 0}>
                Import {selectedCount} selected
              </button>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                You can review these, but not import them.
              </span>
            )}
            <button
              className="btn btn-sm"
              onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: importable(r) })))}
            >
              Select all ready
            </button>
            <button className="btn btn-sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: false })))}>
              Clear selection
            </button>
            {duplicateCount > 0 && (
              <button
                className="btn btn-sm"
                onClick={clearDuplicates}
                title="Hide invoices that are already in the system — nothing is deleted"
              >
                Remove {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} from list
              </button>
            )}
            {doneCount > 0 && doneCount !== duplicateCount && (
              <button className="btn btn-sm" onClick={clearFinished} title="Hide duplicates and anything already imported">
                Remove all finished ({doneCount})
              </button>
            )}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>File</th>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Party</th>
                <th>Item</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>GST</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ok = r.problems.length === 0;
                const rowImportable = importable(r);
                const editing = editingIndex === i;
                const done = r.outcome === 'imported' || r.duplicate;
                return (
                  <Fragment key={i}>
                    <tr
                      style={{
                        background:
                          r.outcome === 'imported' ? '#f0fdf4' : r.outcome === 'failed' ? '#fef2f2' : ok ? undefined : '#fffbeb',
                      }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={r.selected}
                          disabled={!rowImportable}
                          title={rowImportable ? 'Import this invoice' : 'This row cannot be imported yet'}
                          onChange={(e) =>
                            setRows((rs) => rs.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                          }
                        />
                      </td>
                      <td style={{ fontSize: 11 }}>{r.fileName}</td>
                      <td>{r.qr?.docNo || '—'}</td>
                      <td>{fmtDate(r.qr?.docDate || '')}</td>
                      <td>
                        {r.party ? r.party.name : <span style={{ color: '#b45309' }}>not matched</span>}
                        {r.qr?.buyerGstin && (
                          <div className="muted" style={{ fontSize: 10.5 }}>{r.qr.buyerGstin}</div>
                        )}
                      </td>
                      <td>
                        {r.lines.length === 0 && <span style={{ color: '#b45309' }}>no goods line read</span>}
                        {r.lines.map((l, li) => (
                          <div key={li} style={{ marginBottom: r.lines.length > 1 ? 3 : 0 }}>
                            {r.items[li] ? (
                              <>
                                {r.items[li]!.name}
                                {!r.confirmed[li] && (
                                  <span style={{ color: '#b45309', fontWeight: 600 }} title="Matched from the HSN code only — open Edit and confirm it is the right grade">
                                    {' '}· check
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: '#b45309' }}>not matched</span>
                            )}
                            {l.hsn && <span className="muted" style={{ fontSize: 10.5 }}> · HSN {l.hsn}</span>}
                          </div>
                        ))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {r.lines.map((l, li) => (
                          <div key={li} style={{ marginBottom: r.lines.length > 1 ? 3 : 0 }}>{l.qty ?? '—'}</div>
                        ))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {r.lines.map((l, li) => (
                          <div key={li} style={{ marginBottom: r.lines.length > 1 ? 3 : 0 }}>{l.rate ?? '—'}</div>
                        ))}
                      </td>
                      <td style={{ textAlign: 'right' }}>{r.impliedGstPct != null ? `${r.impliedGstPct}%` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{inr(r.qr?.totalValue)}</td>
                      <td style={{ fontSize: 11, maxWidth: 260 }}>
                        {r.outcome === 'imported' ? (
                          <span style={{ color: '#15803d', fontWeight: 600 }}>✓ imported</span>
                        ) : r.outcome === 'failed' ? (
                          <span style={{ color: '#dc2626' }}>Failed — {r.outcomeNote}</span>
                        ) : ok ? (
                          <span style={{ color: '#15803d' }}>
                            ✓ figures reconcile
                            {r.lines.some((l, li) => r.items[li] && !r.confirmed[li]) && (
                              <span style={{ color: '#b45309', fontWeight: 600 }}> · check the item grade in Edit before importing</span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: '#b45309' }}>{r.problems.join(' ')}</span>
                        )}
                      </td>
                      <td>
                        {!done && (
                          <button className="btn btn-sm" onClick={() => setEditingIndex(editing ? null : i)}>
                            {editing ? 'Close' : 'Edit'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {editing && !done && (
                      <tr>
                        <td colSpan={12} style={{ background: '#f8fafc' }}>
                          {editPanel(r, i)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  function editPanel(r: Row, i: number) {
    const { goodsTotal } = reconcile(r.qr?.totalValue, r.lines);
    const qrTotal = r.qr?.totalValue ?? null;
    return (
      <div style={{ padding: '4px 2px' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Correct this invoice — {r.qr?.docNo || r.fileName}
        </div>

        <div className="toolbar" style={{ margin: 0, marginBottom: 10 }}>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 260 }}>
            <label>Party</label>
            <SearchSelect
              value={r.party?.id || ''}
              onChange={(id) => setParty(i, id)}
              options={parties.map((p) => ({ id: p.id, label: p.name }))}
              placeholder="Type party name…"
            />
            {r.qr?.buyerGstin && (
              <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Invoice GSTIN: {r.qr.buyerGstin}</div>
            )}
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Goods lines</div>
          {r.lines.map((l, li) => (
            <div key={li} className="toolbar" style={{ alignItems: 'flex-end', marginBottom: 6, margin: 0, marginTop: li ? 6 : 0 }}>
              <div className="field" style={{ margin: 0, minWidth: 30 }}>
                <label>#</label>
                <div style={{ fontSize: 13, paddingTop: 6 }}>{li + 1}</div>
              </div>
              <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
                <label>Item{l.hsn ? ` · HSN ${l.hsn}` : ''}</label>
                <SearchSelect
                  value={r.items[li]?.id || ''}
                  onChange={(id) => setLineItem(i, li, id)}
                  options={items.map((x) => ({ id: x.id, label: x.name }))}
                  placeholder="Type item name…"
                />
                {r.items[li] && (
                  r.confirmed[li] ? (
                    <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>✓ item confirmed</div>
                  ) : (
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      <span style={{ color: '#b45309' }}>Guessed from HSN — </span>
                      <button className="btn btn-sm" style={{ padding: '1px 8px' }} onClick={() => confirmLineItem(i, li)}>
                        Confirm this is correct
                      </button>
                    </div>
                  )
                )}
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Qty</label>
                <input value={l.qty ?? ''} onChange={(e) => setLineQty(i, li, e.target.value)} style={{ width: 90 }} inputMode="decimal" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Rate</label>
                <input value={l.rate ?? ''} onChange={(e) => setLineRate(i, li, e.target.value)} style={{ width: 100 }} inputMode="decimal" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Value</label>
                <div style={{ fontSize: 13, paddingTop: 6, whiteSpace: 'nowrap' }}>{inr(lineValue(l) || null)}</div>
              </div>
              {r.lines.length > 1 && (
                <button className="btn btn-sm btn-danger" onClick={() => removeLine(i, li)} title="Remove this line">
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => addLine(i)}>
            + Add item line
          </button>
        </div>

        <div className="toolbar" style={{ margin: 0, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5 }}>
            Goods total <strong>{inr(goodsTotal || null)}</strong>
            {' · '}invoice total <strong>{inr(qrTotal)}</strong>
            {' · '}
            {r.matchesQrTotal ? (
              <strong style={{ color: '#15803d' }}>reconciles at {r.impliedGstPct}% GST ✓</strong>
            ) : (
              <strong style={{ color: '#b45309' }}>does not reconcile yet</strong>
            )}
          </span>
          <button className="btn btn-sm" onClick={() => setEditingIndex(null)}>Done</button>
        </div>
      </div>
    );
  }
}
