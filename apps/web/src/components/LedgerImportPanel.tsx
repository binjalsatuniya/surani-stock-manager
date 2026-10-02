import { useEffect, useState } from 'react';
import { OPENING_BALANCE_ITEM_NAME, type Item, type Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { extractPdfText } from '../lib/pdfText';
import { ocrImageText } from '../lib/ocrText';
import { parseLedgerText, type LedgerParty } from '../lib/ledgerImport';

// Each parsed party block, paired with its match against the existing parties (null = would be new).
interface PartyRow {
  parsed: LedgerParty;
  match: Party | null;
  create: boolean; // for a NEW party: whether to create it (user can untick to skip its bills)
}

const fmtMoney = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

// Whole days from bill date to due date → stored as the invoice's credit days, so the app recomputes
// exactly the Tally due date (unpaidInvoicesForParty adds creditDays to the invoice date).
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function LedgerImportPanel() {
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [existingInv, setExistingInv] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState('');
  const [error, setError] = useState('');

  const isDup = (invNo: string) => existingInv.has(invNo.trim().toLowerCase());

  // Paste a screenshot straight from the clipboard (Ctrl+V) — read by OCR, same as an image file.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) {
            e.preventDefault();
            void handleFile(blob);
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(file: File | Blob | null) {
    if (!file) return;
    setError('');
    setReport('');
    setRows([]);
    setBusy(true);
    try {
      const name = (file as File).name?.toLowerCase() ?? '';
      const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
      // PDF → read the real text (exact). Image/screenshot → OCR (check figures in the review).
      const text = isPdf ? await extractPdfText(file as File) : await ocrImageText(file);
      const parsed = parseLedgerText(text);
      if (parsed.parties.length === 0) {
        setError('No pending bills could be read from this PDF. Make sure it is the Tally "Pending Bills" export.');
        setSkipped(parsed.skipped);
        return;
      }
      const allParties = await api.parties.list();
      const byName = new Map(allParties.map((p) => [p.name.trim().toLowerCase(), p]));
      const outward = await api.outward.list();
      setExistingInv(new Set(outward.map((o) => (o.invNo || '').trim().toLowerCase()).filter(Boolean)));
      setRows(
        parsed.parties.map((pp) => ({
          parsed: pp,
          match: byName.get(pp.name.trim().toLowerCase()) ?? null,
          create: true,
        }))
      );
      setSkipped(parsed.skipped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the PDF.');
    } finally {
      setBusy(false);
    }
  }

  const newParties = rows.filter((r) => !r.match);
  const newToCreate = newParties.filter((r) => r.create).length;
  const importableBills = rows.reduce(
    (s, r) => s + (r.match || r.create ? r.parsed.bills.filter((b) => !isDup(b.invNo)).length : 0),
    0
  );
  const grandTotal = rows.reduce(
    (s, r) => s + (r.match || r.create ? r.parsed.bills.filter((b) => !isDup(b.invNo)).reduce((a, b) => a + b.amount, 0) : 0),
    0
  );

  async function ensurePlaceholderItem(): Promise<Item> {
    const items = await api.items.list();
    const found = items.find((i) => i.name === OPENING_BALANCE_ITEM_NAME);
    if (found) return found;
    return api.items.create({
      name: OPENING_BALANCE_ITEM_NAME,
      category: null,
      unit: 'pcs',
      code: null,
      gstPct: 0,
      rate: 0,
      opening: 0,
      reorder: 0,
      rateDate: null,
      tdsAttachment: null,
      tdsAttachmentName: null,
    });
  }

  async function onImport() {
    setError('');
    setBusy(true);
    let created = 0,
      skippedBills = 0,
      madeParties = 0,
      failed = 0;
    try {
      const placeholder = await ensurePlaceholderItem();
      const total = importableBills;
      let done = 0;
      setProgress({ done, total });
      for (const row of rows) {
        let party = row.match;
        if (!party) {
          if (!row.create) continue; // user chose not to create this new party → skip its bills
          party = await api.parties.create({
            name: row.parsed.name,
            type: 'debtor',
            salesPersonId: null,
            phone: null,
            email: null,
            gst: null,
            opening: 0,
            creditDays: 0,
            defaultFreight: 0,
            address: null,
            locationUrl: null,
            vehicle: null,
            followUpDays: null,
          });
          madeParties++;
        }
        for (const b of row.parsed.bills) {
          if (isDup(b.invNo)) {
            skippedBills++;
            continue;
          }
          const creditDays = b.dueDate ? Math.max(0, daysBetween(b.date, b.dueDate)) : 0;
          try {
            await api.outward.create({
              date: b.date,
              partyId: party.id,
              itemId: placeholder.id,
              qty: 1,
              rate: b.amount,
              gstPct: 0,
              payStatus: 'pending',
              creditDays,
              invNo: b.invNo,
              fulfil: 'delivered',
            });
            created++;
          } catch {
            failed++;
          }
          done++;
          setProgress({ done, total });
        }
      }
      setReport(
        `Imported ${created} bill${created === 1 ? '' : 's'}` +
          (madeParties ? `, created ${madeParties} new part${madeParties === 1 ? 'y' : 'ies'}` : '') +
          (skippedBills ? `, skipped ${skippedBills} already in the system` : '') +
          (failed ? `, ${failed} failed` : '') +
          '. They now show in Payment Due.'
      );
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 16 }}>
        Upload a Tally <b>“Sundry Debtors – Pending Bills”</b> PDF. Each party’s outstanding bills (invoice no,
        date, amount, due date) are read and shown below for review. <b>New parties are flagged</b> — untick any you
        don’t want created. Nothing is saved until you press <b>Import</b>; bills whose invoice number is already in
        the system are skipped automatically.
      </div>

      <input
        type="file"
        accept="application/pdf,image/*"
        disabled={busy}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        Upload a <b>PDF</b> (most exact) — or <b>paste a screenshot</b> with <b>Ctrl+V</b> / upload an image
        (read by OCR; double-check the figures in the review below).
      </p>

      {busy && progress.total > 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          Importing… {progress.done}/{progress.total}
        </p>
      )}
      {error && <p style={{ color: '#dc2626', marginTop: 10 }}>{error}</p>}
      {report && <p style={{ color: '#16a34a', marginTop: 10, fontWeight: 600 }}>{report}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>
              {rows.length} part{rows.length === 1 ? 'y' : 'ies'} · {importableBills} bill{importableBills === 1 ? '' : 's'} · {fmtMoney(grandTotal)}
            </b>
            {newParties.length > 0 && (
              <span style={{ color: '#b45309' }}>
                {newToCreate} new part{newToCreate === 1 ? 'y' : 'ies'} will be created
              </span>
            )}
            <button className="btn" disabled={busy || importableBills === 0} onClick={onImport} style={{ marginLeft: 'auto' }}>
              {busy ? 'Importing…' : `Import ${importableBills} bill${importableBills === 1 ? '' : 's'}`}
            </button>
          </div>

          {rows.map((row, i) => {
            const bills = row.parsed.bills;
            const partyTotal = bills.filter((b) => !isDup(b.invNo)).reduce((a, b) => a + b.amount, 0);
            return (
              <div key={i} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 15 }}>{row.parsed.name}</b>
                  {row.match ? (
                    <span style={{ fontSize: 12, color: '#16a34a' }}>✓ existing party</span>
                  ) : (
                    <label style={{ fontSize: 12, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={row.create}
                        onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, create: e.target.checked } : r)))}
                      />
                      NEW — will be created
                    </label>
                  )}
                  <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmtMoney(partyTotal)}</span>
                </div>
                <table style={{ width: '100%', marginTop: 8, fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#64748b' }}>
                      <th>Date</th>
                      <th>Invoice No.</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Due on</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b, k) => {
                      const dup = isDup(b.invNo);
                      return (
                        <tr key={k} style={{ opacity: dup ? 0.5 : 1 }}>
                          <td>{fmtDate(b.date)}</td>
                          <td>{b.invNo}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoney(b.amount)}</td>
                          <td>{fmtDate(b.dueDate)}</td>
                          <td style={{ color: '#b45309', fontSize: 11 }}>{dup ? 'already in system — skipped' : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {skipped.length > 0 && (
            <div className="card" style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
              <b>Couldn’t read {skipped.length} line{skipped.length === 1 ? '' : 's'}</b> (check these against the PDF):
              <ul style={{ margin: '6px 0 0', fontSize: 12, color: '#7f1d1d' }}>
                {skipped.slice(0, 20).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
