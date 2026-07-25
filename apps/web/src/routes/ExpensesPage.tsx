import { useEffect, useMemo, useState } from 'react';
import { buildWhatsappLink, type SalesPerson, type SalesPersonExpense } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { exportExpenseLedgerPdf } from '../lib/pdfExport';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n: number) => `₹${n.toFixed(2)}`;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // ~5 MB

const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  salesPersonId: '',
  amount: '',
  expenseFor: '',
};

export function ExpensesPage() {
  const can = usePermission();
  const canEdit = can('edit_expenses');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [rows, setRows] = useState<SalesPersonExpense[]>([]);
  const [filterSp, setFilterSp] = useState('');
  const [form, setForm] = useState({ ...EMPTY });
  const [attachment, setAttachment] = useState<{ data: string; name: string } | null>(null);
  const [error, setError] = useState('');
  // The sales person whose dedicated ledger is open (null = none).
  const [ledgerSpId, setLedgerSpId] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<SalesPersonExpense[]>([]);

  function openLedger(id: string) {
    setLedgerSpId(id);
    api.expenses.list({ salesPersonId: id }).then(setLedgerRows);
  }

  function onExportLedgerPdf() {
    if (!ledgerSpId) return;
    exportExpenseLedgerPdf(spName(ledgerSpId), ledgerRows);
  }

  function onShareLedger() {
    if (!ledgerSpId) return;
    const sp = salesPersons.find((s) => s.id === ledgerSpId);
    const ordered = [...ledgerRows].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    let running = 0;
    const lines = ordered.map((e) => {
      running += e.amount;
      return `${fmtDate(e.date)} — ${e.expenseFor}\n   ${inr(e.amount)}  (Total ${inr(running)})`;
    });
    const total = ordered.reduce((s, e) => s + e.amount, 0);
    const message = [
      '🧾 *EXPENSE LEDGER*',
      '',
      '*Surani and Sons*',
      '',
      `👤 *${sp?.name || ''}*`,
      `📅 As on: ${fmtDate(new Date().toISOString())}`,
      '',
      lines.length ? lines.join('\n\n') : 'No expenses recorded.',
      '',
      `*Total Expense: ${inr(total)}*`,
      '',
      'Thank you 🙏',
    ].join('\n');
    window.open(buildWhatsappLink(sp?.phone, message), '_blank');
  }

  async function reload() {
    setRows(await api.expenses.list({ salesPersonId: filterSp || undefined }));
  }

  useEffect(() => {
    api.salesPersons.list().then(setSalesPersons);
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSp]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPickFile(file: File | null) {
    setError('');
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment is too large (max 5 MB). Please attach a smaller image or PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ data: String(reader.result), name: file.name });
    reader.onerror = () => setError('Could not read that file. Please try another one.');
    reader.readAsDataURL(file);
  }

  async function onAdd() {
    setError('');
    if (!form.salesPersonId) return setError('Please select a sales person.');
    if (!form.amount) return setError('Please enter an amount.');
    if (!form.expenseFor.trim()) return setError('Please enter what the expense is for.');
    try {
      await api.expenses.create({
        salesPersonId: form.salesPersonId,
        date: form.date,
        amount: Number(form.amount),
        expenseFor: form.expenseFor.trim(),
        attachment: attachment?.data || null,
        attachmentName: attachment?.name || null,
      });
      setForm((f) => ({ ...EMPTY, date: f.date }));
      setAttachment(null);
      reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add expense');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this expense entry?')) return;
    await api.expenses.remove(id);
    reload();
    if (ledgerSpId) openLedger(ledgerSpId);
  }

  async function onTogglePaid(exp: SalesPersonExpense) {
    await api.expenses.setPaid(exp.id, !exp.paid);
    reload();
    if (ledgerSpId) openLedger(ledgerSpId);
  }

  function openAttachment(exp: SalesPersonExpense) {
    if (!exp.attachment) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const name = exp.attachmentName || 'attachment';
    // Render the data URL (image or PDF) in a simple viewer with a download link.
    w.document.write(
      `<title>${name}</title><body style="margin:0;background:#111;display:flex;flex-direction:column;align-items:center">
       <div style="padding:8px;background:#222;width:100%;text-align:center">
         <a href="${exp.attachment}" download="${name}" style="color:#25d366;font-family:sans-serif">⬇ Download ${name}</a>
       </div>
       ${exp.attachment.startsWith('data:application/pdf')
         ? `<iframe src="${exp.attachment}" style="border:0;width:100%;height:95vh"></iframe>`
         : `<img src="${exp.attachment}" style="max-width:100%;max-height:95vh;object-fit:contain"/>`}
       </body>`
    );
    w.document.close();
  }

  const spName = (id: string) => salesPersons.find((s) => s.id === id)?.name || id;

  // Per-sales-person expense ledger (the separate ledger / column) — grouped totals.
  const perSalesPerson = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of rows) {
      const cur = map.get(r.salesPersonId) || { name: spName(r.salesPersonId), total: 0, count: 0 };
      cur.total += r.amount;
      cur.count += 1;
      map.set(r.salesPersonId, cur);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, salesPersons]);

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          Sales Person Expenses <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— field / travel / other expenses</span>
        </h2>

        {canEdit && (
          <>
            <div className="toolbar">
              <div className="field" style={{ margin: 0 }}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Sales Person</label>
                <select value={form.salesPersonId} onChange={(e) => set('salesPersonId', e.target.value)}>
                  <option value="">Select…</option>
                  {salesPersons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Amount (₹)</label>
                <input value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 110 }} />
              </div>
              <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Expense For</label>
                <input value={form.expenseFor} onChange={(e) => set('expenseFor', e.target.value)} placeholder="e.g. Fuel, hotel, client lunch…" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Attachment (invoice)</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
                {attachment && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>📎 {attachment.name}</div>}
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={onAdd}>
                Add Expense
              </button>
              {salesPersons.length === 0 && (
                <span className="muted">Add sales persons first (Parties page) to record expenses against them.</span>
              )}
            </div>
          </>
        )}
        {error && <div className="login-err show">{error}</div>}
      </div>

      {/* Separate expense ledger: per-sales-person totals — click "Open Ledger" for a full statement */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Expense Ledger by Sales Person</h3>
        <table>
          <thead>
            <tr>
              <th>Sales Person</th>
              <th style={{ textAlign: 'right' }}>Entries</th>
              <th style={{ textAlign: 'right' }}>Total Expense (₹)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perSalesPerson.map((g) => (
              <tr key={g.id}>
                <td><strong>{g.name}</strong></td>
                <td style={{ textAlign: 'right' }}>{g.count}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{inr(g.total)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => openLedger(g.id)}>
                    Open Ledger
                  </button>
                </td>
              </tr>
            ))}
            {perSalesPerson.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No expenses recorded yet.</td>
              </tr>
            )}
          </tbody>
          {perSalesPerson.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>Grand Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{rows.length}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{inr(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Dedicated ledger for the selected sales person */}
      {ledgerSpId && (
        <div className="card" style={{ border: '1px solid var(--accent, #0d9488)' }}>
          <div className="toolbar" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0, flex: 1 }}>
              Expense Ledger — {spName(ledgerSpId)}
              <span className="muted" style={{ fontSize: 12, fontWeight: 500, marginLeft: 8 }}>
                Total: <span style={{ color: '#ef4444', fontWeight: 700 }}>{inr(ledgerRows.reduce((s, r) => s + r.amount, 0))}</span>
              </span>
            </h3>
            {can('send_whatsapp') && (
              <button className="btn btn-sm btn-whatsapp" onClick={onShareLedger} title="Share this ledger on WhatsApp">
                Share on WhatsApp
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={onExportLedgerPdf}>Export PDF</button>
            <button className="btn btn-sm" onClick={() => setLedgerSpId(null)}>Close</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Expense For</th>
                <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                <th style={{ textAlign: 'right' }}>Running Total (₹)</th>
                <th>Status</th>
                <th>Attachment</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Oldest-first so the running total accumulates correctly.
                const ordered = [...ledgerRows].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
                let running = 0;
                return ordered.map((r) => {
                  running += r.amount;
                  return (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.expenseFor}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(r.amount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(running)}</td>
                      <td>
                        {r.paid ? (
                          <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>✅ Paid</span>
                        ) : (
                          <span style={{ color: '#b45309', fontWeight: 700, fontSize: 12 }}>● Unpaid</span>
                        )}
                        {canEdit && (
                          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onTogglePaid(r)}>
                            {r.paid ? 'Mark unpaid' : 'Mark paid'}
                          </button>
                        )}
                      </td>
                      <td>
                        {r.attachment ? (
                          <button className="btn btn-sm" onClick={() => openAttachment(r)} title="View / download the attached invoice">
                            📎 View
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                });
              })()}
              {ledgerRows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="muted">No expenses for this sales person yet.</td>
                </tr>
              )}
            </tbody>
            {ledgerRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700 }}>Closing Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{inr(ledgerRows.reduce((s, r) => s + r.amount, 0))}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {canEdit && <td></td>}
                </tr>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700 }}>Still to pay (unpaid)</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#b45309' }}>
                    {inr(ledgerRows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0))}
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {canEdit && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Detailed list */}
      <div className="card">
        <div className="toolbar" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0, flex: 1 }}>All Expenses</h3>
          <div className="field" style={{ margin: 0 }}>
            <label>Filter by Sales Person</label>
            <select value={filterSp} onChange={(e) => setFilterSp(e.target.value)}>
              <option value="">All Sales Persons</option>
              {salesPersons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Sales Person</th>
              <th>Expense For</th>
              <th style={{ textAlign: 'right' }}>Amount (₹)</th>
              <th>Status</th>
              <th>Attachment</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date)}</td>
                <td>{spName(r.salesPersonId)}</td>
                <td>{r.expenseFor}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(r.amount)}</td>
                <td>
                  {r.paid ? (
                    <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>
                      ✅ Paid{r.paidAt ? ` · ${fmtDate(r.paidAt)}` : ''}
                    </span>
                  ) : (
                    <span style={{ color: '#b45309', fontWeight: 700, fontSize: 12 }}>● Unpaid</span>
                  )}
                  {canEdit && (
                    <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onTogglePaid(r)}>
                      {r.paid ? 'Mark unpaid' : 'Mark paid'}
                    </button>
                  )}
                </td>
                <td>
                  {r.attachment ? (
                    <button className="btn btn-sm" onClick={() => openAttachment(r)} title="View / download the attached invoice">
                      📎 View
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                {canEdit && (
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="muted">No expenses for this selection.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
