import { useEffect, useState } from 'react';
import type { Item, Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { readScannedInvoice, type ScannedInvoice } from '../lib/invoiceImport';

/**
 * Reads a pile of scanned sales invoices and shows what it found, so old records can be entered
 * without typing every field.
 *
 * This screen deliberately saves nothing. Reading a scan is part exact (the signed e-Invoice QR)
 * and part guesswork (OCR of the goods table), and the point of the review table is to see which
 * is which before anything reaches the database.
 */

interface Row extends ScannedInvoice {
  party: Party | null;
  /** One matched item per goods line, in the same order; null where the HSN is unknown. */
  items: (Item | null)[];
  /** True once the invoice number is known to already exist. */
  duplicate: boolean;
  selected: boolean;
  outcome: 'imported' | 'skipped' | 'failed' | null;
  outcomeNote?: string;
}

const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function ImportScansPage() {
  const can = usePermission();
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

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
    setProgress({ done: 0, total: files.length });
    const out: Row[] = [];
    // One at a time: each file spins up an OCR worker, and running many at once starves the tab.
    for (let i = 0; i < files.length; i++) {
      const scan = await readScannedInvoice(files[i]);
      const buyer = normGst(scan.qr?.buyerGstin);
      const party = buyer ? parties.find((p) => normGst(p.gst) === buyer) ?? null : null;
      const matched = scan.lines.map((l) => (l.hsn ? items.find((it) => hsnCodesOf(it.code).includes(l.hsn!)) ?? null : null));
      if (buyer && !party) scan.problems.push(`No party in your list has GSTIN ${buyer}.`);
      const missing = scan.lines.filter((l, i) => l.hsn && !matched[i]).map((l) => l.hsn);
      if (missing.length)
        scan.problems.push(
          `No item has HSN code ${missing.join(', ')}. Add it to that item's Code field in Item Master — ` +
            `several codes can be listed, separated by commas.`
        );
      const invNo = (scan.qr?.docNo || '').trim().toUpperCase();
      // Duplicate against what is already saved, AND against earlier files in this same batch —
      // selecting the same invoice twice in one go would otherwise import it twice.
      const alreadySaved = !!invNo && existingInvNos.has(invNo);
      const earlierInBatch = !!invNo && out.some((p) => (p.qr?.docNo || '').trim().toUpperCase() === invNo);
      const duplicate = alreadySaved || earlierInBatch;
      if (alreadySaved) scan.problems.push('This invoice number is already in the system.');
      else if (earlierInBatch) scan.problems.push('This invoice appears more than once in the files you selected.');
      out.push({
        ...scan,
        party,
        items: matched,
        duplicate,
        // Only rows that need no judgement are ticked; the rest are a deliberate choice.
        selected: scan.problems.length === 0,
        outcome: null,
      });
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
      // Every line must be complete: importing an invoice with one of its items missing would
      // understate the sale, and be harder to notice than a row that plainly failed.
      r.lines.every((l, i) => !!r.items[i] && l.qty != null && l.rate != null)
    );
  }

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
    setRows((rs) => rs.filter((r) => !r.duplicate));
  }
  function clearFinished() {
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
          the page and are checked against that total — a row only shows as ready when the figures
          reconcile.
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ok = r.problems.length === 0;
                const canImport = importable(r);
                return (
                  <tr
                    key={i}
                    style={{
                      background:
                        r.outcome === 'imported' ? '#f0fdf4' : r.outcome === 'failed' ? '#fef2f2' : ok ? undefined : '#fffbeb',
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={r.selected}
                        disabled={!canImport}
                        title={canImport ? 'Import this invoice' : 'This row cannot be imported yet'}
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
                          {r.items[li] ? r.items[li]!.name : <span style={{ color: '#b45309' }}>not matched</span>}
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
                      ) : (
                        <span style={{ color: ok ? '#15803d' : '#b45309' }}>
                          {ok ? '✓ figures reconcile' : r.problems.join(' ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
