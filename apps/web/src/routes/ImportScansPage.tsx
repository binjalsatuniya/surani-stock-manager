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
  item: Item | null;
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

  useEffect(() => {
    api.parties.list().then(setParties);
    api.items.list().then(setItems);
  }, []);

  const normGst = (g: string | null | undefined) => (g || '').replace(/\s/g, '').toUpperCase();

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
      const item = scan.hsn ? items.find((it) => (it.code || '').replace(/\s/g, '') === scan.hsn) ?? null : null;
      if (buyer && !party) scan.problems.push(`No party in your list has GSTIN ${buyer}.`);
      if (scan.hsn && !item) scan.problems.push(`No item has HSN code ${scan.hsn}.`);
      out.push({ ...scan, party, item });
      setRows([...out]);
      setProgress({ done: i + 1, total: files.length });
    }
    setBusy(false);
  }

  const ready = rows.filter((r) => r.problems.length === 0).length;

  if (!can('add_outward')) return <div className="card">You do not have permission to import invoices.</div>;

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
          <strong>Nothing is saved yet.</strong> This screen only shows what it read, so you can judge
          the accuracy before we turn on importing.
        </div>
        <input type="file" accept="application/pdf,image/*" multiple disabled={busy} onChange={(e) => onPick(e.target.files)} />
        {busy && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Reading {progress.done} of {progress.total}… (a few seconds each)
          </div>
        )}
        {!busy && rows.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <strong>{ready}</strong> of <strong>{rows.length}</strong> read cleanly.
            {ready < rows.length && <span className="muted"> The rest need checking — see the notes column.</span>}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
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
                return (
                  <tr key={i} style={{ background: ok ? undefined : '#fffbeb' }}>
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
                      {r.item ? r.item.name : <span style={{ color: '#b45309' }}>not matched</span>}
                      {r.hsn && <div className="muted" style={{ fontSize: 10.5 }}>HSN {r.hsn}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.qty ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.rate ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.impliedGstPct != null ? `${r.impliedGstPct}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{inr(r.qr?.totalValue)}</td>
                    <td style={{ fontSize: 11, color: ok ? '#15803d' : '#b45309', maxWidth: 260 }}>
                      {ok ? '✓ figures reconcile' : r.problems.join(' ')}
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
