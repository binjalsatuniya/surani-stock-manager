import { useEffect, useMemo, useState } from 'react';
import { buildWhatsappLink, PAYMENT_MODES, type SalesPerson, type SalesPersonExpense, type Trip } from '@surani/shared';
import { api } from '../lib/apiClient';
import { shareOnWhatsapp } from '../lib/whatsappShare';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useDialogs } from '../components/Dialogs';
import { exportExpenseLedgerPdf } from '../lib/pdfExport';
import { getPdfLayout } from '../lib/pdfLayout';
import { openDataUrlInNewTab } from '../lib/dataUrl';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n: number) => `₹${n.toFixed(2)}`;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // ~5 MB

const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  salesPersonId: '',
  amount: '',
  expenseFor: '',
  tripId: '',
};

export function ExpensesPage() {
  const { user } = useAuth();
  const can = usePermission();
  const { confirm } = useDialogs();
  const canDelete = can('delete_expenses');
  const canEditExpense = can('edit_expenses');
  const canEdit = can('add_expenses') || canEditExpense || canDelete;
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [rows, setRows] = useState<SalesPersonExpense[]>([]);
  const [filterSp, setFilterSp] = useState('');
  const [form, setForm] = useState({ ...EMPTY });
  const [attachment, setAttachment] = useState<{ data: string; name: string } | null>(null);
  const [error, setError] = useState('');
  // The sales person whose dedicated ledger is open (null = none).
  const [ledgerSpId, setLedgerSpId] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<SalesPersonExpense[]>([]);
  // Trips: a named grouping an expense can be tagged with.
  const canManageTrips = can('manage_expense_trips');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [newTripName, setNewTripName] = useState('');
  const [tripMsg, setTripMsg] = useState('');
  const loadTrips = () => api.trips.list().then(setTrips).catch(() => {});
  // Trip ledger being viewed (its expenses + total).
  const [tripLedger, setTripLedger] = useState<Trip | null>(null);
  const [tripLedgerRows, setTripLedgerRows] = useState<SalesPersonExpense[]>([]);

  function openLedger(id: string) {
    setLedgerSpId(id);
    api.expenses.list({ salesPersonId: id }).then(setLedgerRows);
  }

  async function onExportLedgerPdf() {
    if (!ledgerSpId) return;
    exportExpenseLedgerPdf(spName(ledgerSpId), ledgerRows, await getPdfLayout());
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
    shareOnWhatsapp(sp?.phone, message);
  }

  async function reload() {
    setRows(await api.expenses.list({ salesPersonId: filterSp || undefined }));
  }

  const [rule, setRule] = useState<{ backdateDays: number | null; today: string } | null>(null);
  const [ruleInput, setRuleInput] = useState('');
  const [ruleMsg, setRuleMsg] = useState('');

  useEffect(() => {
    api.salesPersons.list().then(setSalesPersons);
    loadTrips();
    api.expenses.getRule().then((r) => {
      setRule(r);
      setRuleInput(r.backdateDays === null ? '' : String(r.backdateDays));
    }).catch(() => {});
  }, []);

  // Earliest date the form allows, from the rule (null = no limit).
  const earliestDate = rule && rule.backdateDays !== null ? (() => {
    const d = new Date(rule.today + 'T00:00:00');
    d.setDate(d.getDate() - rule.backdateDays);
    return d.toISOString().slice(0, 10);
  })() : undefined;

  async function onSaveRule() {
    setRuleMsg('');
    const n = ruleInput.trim() === '' ? null : Math.max(0, Math.floor(Number(ruleInput)));
    if (ruleInput.trim() !== '' && Number.isNaN(Number(ruleInput))) return setRuleMsg('Enter a number of days, or leave blank for no limit.');
    try {
      const r = await api.expenses.setRule(n);
      setRule(r);
      setRuleMsg('Saved.');
    } catch (e) {
      setRuleMsg(e instanceof Error ? e.message : 'Failed to save rule');
    }
  }

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

  async function createTrip() {
    setTripMsg('');
    if (!newTripName.trim()) return setTripMsg('Enter a trip name.');
    try {
      await api.trips.create({ name: newTripName.trim() });
      setNewTripName('');
      setTripMsg('Trip added.');
      loadTrips();
    } catch (e) {
      setTripMsg(e instanceof Error ? e.message : 'Failed to add trip');
    }
  }
  // Marking a trip paid asks HOW (mode + who), then settles its expenses and closes it.
  const [tripPayTarget, setTripPayTarget] = useState<Trip | null>(null);
  const [tripPayBy, setTripPayBy] = useState('');
  const [tripPayMode, setTripPayMode] = useState<string>('Cash');

  function openTripPay(t: Trip) {
    setTripPayBy('Company');
    setTripPayMode('Cash');
    setTripPayTarget(t);
  }
  async function confirmTripPay() {
    if (!tripPayTarget) return;
    setTripMsg('');
    try {
      await api.trips.pay(tripPayTarget.id, { paidBy: tripPayBy.trim() || null, paidMode: tripPayMode });
      setTripPayTarget(null);
      loadTrips();
      reload();
      if (ledgerSpId) openLedger(ledgerSpId);
      if (tripLedger) openTripLedger(tripLedger); // refresh the open ledger's paid marks
    } catch (e) {
      setTripMsg(e instanceof Error ? e.message : 'Failed to mark trip paid');
    }
  }
  async function reopenTrip(t: Trip) {
    setTripMsg('');
    try {
      await api.trips.setClosed(t.id, false);
      loadTrips();
    } catch (e) {
      setTripMsg(e instanceof Error ? e.message : 'Failed to reopen trip');
    }
  }
  function openTripLedger(t: Trip) {
    setTripLedger(t);
    setTripLedgerRows([]);
    api.expenses.list({ tripId: t.id }).then(setTripLedgerRows).catch(() => setTripLedgerRows([]));
  }

  async function deleteTrip(id: string) {
    if (!(await confirm('Delete this trip? Expenses tagged to it just lose the tag; they are not deleted.', { okLabel: 'Delete', danger: true }))) return;
    try {
      await api.trips.remove(id);
      loadTrips();
      reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } catch (e) {
      setTripMsg(e instanceof Error ? e.message : 'Failed to delete trip');
    }
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
        tripId: form.tripId || null,
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
    if (!(await confirm('Delete this expense entry?', { okLabel: 'Delete', danger: true }))) return;
    await api.expenses.remove(id);
    reload();
    if (ledgerSpId) openLedger(ledgerSpId);
  }

  // Marking paid opens a small dialog for the mode + who paid; unmarking just clears it.
  const [payTarget, setPayTarget] = useState<SalesPersonExpense | null>(null);
  const [payBy, setPayBy] = useState('');
  const [payMode, setPayMode] = useState<string>('Cash');

  async function onTogglePaid(exp: SalesPersonExpense) {
    if (exp.paid) {
      await api.expenses.setPaid(exp.id, false);
      reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } else {
      setPayBy('Company');
      setPayMode('Cash');
      setPayTarget(exp);
    }
  }

  async function confirmPay() {
    if (!payTarget) return;
    await api.expenses.setPaid(payTarget.id, true, { paidBy: payBy.trim() || null, paidMode: payMode });
    setPayTarget(null);
    reload();
    if (ledgerSpId) openLedger(ledgerSpId);
  }

  // Editing an expense's details (JAYNIL / anyone with edit_expenses).
  const [editTarget, setEditTarget] = useState<SalesPersonExpense | null>(null);
  const [ed, setEd] = useState({ date: '', salesPersonId: '', amount: '', expenseFor: '', tripId: '' });
  const [edAttachment, setEdAttachment] = useState<{ data: string; name: string } | null>(null);

  function openEdit(exp: SalesPersonExpense) {
    setError('');
    setEditTarget(exp);
    setEd({ date: exp.date.slice(0, 10), salesPersonId: exp.salesPersonId, amount: String(exp.amount), expenseFor: exp.expenseFor, tripId: exp.tripId || '' });
    setEdAttachment(null);
  }
  function onPickEditFile(file: File | null) {
    setError('');
    if (!file) return setEdAttachment(null);
    if (file.size > MAX_ATTACHMENT_BYTES) return setError('Attachment is too large (max 5 MB).');
    const reader = new FileReader();
    reader.onload = () => setEdAttachment({ data: String(reader.result), name: file.name });
    reader.onerror = () => setError('Could not read that file. Please try another one.');
    reader.readAsDataURL(file);
  }
  async function confirmEdit() {
    if (!editTarget) return;
    setError('');
    if (!ed.salesPersonId) return setError('Please select a sales person.');
    if (!ed.amount) return setError('Please enter an amount.');
    if (!ed.expenseFor.trim()) return setError('Please enter what the expense is for.');
    try {
      await api.expenses.update(editTarget.id, {
        salesPersonId: ed.salesPersonId,
        date: ed.date,
        amount: Number(ed.amount),
        expenseFor: ed.expenseFor.trim(),
        tripId: ed.tripId || null,
        // Only send a new attachment when one was picked; leaving it keeps the current file.
        ...(edAttachment ? { attachment: edAttachment.data, attachmentName: edAttachment.name } : {}),
      });
      setEditTarget(null);
      reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit expense');
    }
  }

  // Keyboard shortcuts while a dialog is open: Enter saves, Esc cancels.
  useEffect(() => {
    if (!editTarget && !payTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        editTarget ? setEditTarget(null) : setPayTarget(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        editTarget ? confirmEdit() : confirmPay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget, payTarget, ed, edAttachment, payBy, payMode]);

  // Enter saves the new expense; Esc clears the add form. Scoped to the form so it doesn't fire elsewhere.
  function onAddFormKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setForm((f) => ({ ...EMPTY, date: f.date }));
      setAttachment(null);
      setError('');
    }
  }

  // Opens the bill in a new tab. A data: URL is converted to a blob first — Chromium will not
  // render a PDF from a data: URL, so the old viewer showed an empty frame. See lib/dataUrl.ts.
  function openAttachment(exp: SalesPersonExpense) {
    if (!exp.attachment) return;
    if (!openDataUrlInNewTab(exp.attachment)) {
      setError('The attached bill could not be read — it may have been saved incompletely.');
    }
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

        {/* Back-dating rule — JAYNIL configures how far back an expense may be dated. */}
        {user?.isPrimary && (
          <div style={{ marginBottom: 12, padding: 10, border: '1px dashed var(--line)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Expense date rule:</span>
            <span className="muted" style={{ fontSize: 12 }}>allow dates up to</span>
            <input
              value={ruleInput}
              onChange={(e) => setRuleInput(e.target.value)}
              placeholder="days"
              style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8 }}
            />
            <span className="muted" style={{ fontSize: 12 }}>days old (0 = only today, blank = no limit)</span>
            <button className="btn btn-sm btn-primary" onClick={onSaveRule}>Save rule</button>
            {ruleMsg && <span style={{ fontSize: 12, color: '#0f766e' }}>{ruleMsg}</span>}
          </div>
        )}

        {canManageTrips && (
          <div style={{ marginBottom: 12, padding: 10, border: '1px dashed var(--line)', borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              Trips <span className="muted" style={{ fontWeight: 500 }}>— create a trip, then tag expenses to it</span>
            </div>
            <div className="toolbar" style={{ margin: 0, alignItems: 'center' }}>
              <input
                value={newTripName}
                onChange={(e) => setNewTripName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createTrip(); } }}
                placeholder="New trip name (e.g. Mumbai — Aug)"
                style={{ minWidth: 240, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}
              />
              <button className="btn btn-sm btn-primary" onClick={createTrip}>Add Trip</button>
              {tripMsg && <span className="muted" style={{ fontSize: 12 }}>{tripMsg}</span>}
            </div>
            {trips.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
                {trips.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>
                      {t.name}
                      {t.closedAt ? (
                        <span style={{ marginLeft: 8, color: '#15803d', fontWeight: 700, fontSize: 11 }}>✓ Paid / closed</span>
                      ) : (
                        <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 700, fontSize: 11 }}>● Open</span>
                      )}
                    </span>
                    <button className="btn btn-sm" onClick={() => openTripLedger(t)}>Ledger</button>
                    {t.closedAt ? (
                      <button className="btn btn-sm" onClick={() => reopenTrip(t)}>Reopen</button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => openTripPay(t)}>Mark as Paid</button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => deleteTrip(t.id)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {canEdit && (
          <div onKeyDown={onAddFormKey}>
            {rule && rule.backdateDays !== null && (
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
                {rule.backdateDays === 0
                  ? 'Only today’s expenses can be added.'
                  : `Expenses can be dated at most ${rule.backdateDays} day(s) back (from ${earliestDate}).`}
              </div>
            )}
            <div className="toolbar">
              <div className="field" style={{ margin: 0 }}>
                <label>Date</label>
                <input type="date" value={form.date} min={earliestDate} max={rule?.today} onChange={(e) => set('date', e.target.value)} />
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
                <label>Trip</label>
                <select value={form.tripId} onChange={(e) => set('tripId', e.target.value)}>
                  <option value="">— none —</option>
                  {trips.filter((t) => !t.closedAt).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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
          </div>
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
                      <td>
                  {r.expenseFor}
                  {r.tripName && <div style={{ fontSize: 10.5, color: '#0f766e', fontWeight: 600 }}>🧭 {r.tripName}</div>}
                </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(r.amount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(running)}</td>
                      <td>
                        {r.paid ? (
                          <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>
                            ✅ Paid{r.paidMode ? ` · ${r.paidMode}` : ''}{r.paidBy ? ` · by ${r.paidBy}` : ''}
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
                          <div style={{ display: 'flex', gap: 6 }}>
                            {canEditExpense && (
                              <button className="btn btn-sm" onClick={() => openEdit(r)}>Edit</button>
                            )}
                            {canDelete && (
                              <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                                Delete
                              </button>
                            )}
                          </div>
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
                <td>
                  {r.expenseFor}
                  {r.tripName && <div style={{ fontSize: 10.5, color: '#0f766e', fontWeight: 600 }}>🧭 {r.tripName}</div>}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(r.amount)}</td>
                <td>
                  {r.paid ? (
                    <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>
                      ✅ Paid{r.paidMode ? ` · ${r.paidMode}` : ''}{r.paidBy ? ` · by ${r.paidBy}` : ''}
                      {r.paidAt ? ` · ${fmtDate(r.paidAt)}` : ''}
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canEditExpense && (
                        <button className="btn btn-sm" onClick={() => openEdit(r)}>Edit</button>
                      )}
                      {canDelete && (
                        <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                          Delete
                        </button>
                      )}
                    </div>
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

      {payTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setPayTarget(null)}
        >
          <div className="card" style={{ width: 340, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Mark as paid</h3>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              {payTarget.expenseFor} — {inr(payTarget.amount)}
            </div>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Payment mode</label>
              <select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: '0 0 14px' }}>
              <label>Paid by</label>
              <input value={payBy} onChange={(e) => setPayBy(e.target.value)} placeholder="Who paid it" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmPay}>Confirm paid</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setPayTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setEditTarget(null)}
        >
          <div className="card" style={{ width: 420, maxWidth: '92%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Edit expense</h3>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Date</label>
              <input type="date" value={ed.date} min={earliestDate} max={rule?.today} onChange={(e) => setEd({ ...ed, date: e.target.value })} />
            </div>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Sales Person</label>
              <select value={ed.salesPersonId} onChange={(e) => setEd({ ...ed, salesPersonId: e.target.value })}>
                <option value="">Select…</option>
                {salesPersons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Amount (₹)</label>
              <input value={ed.amount} onChange={(e) => setEd({ ...ed, amount: e.target.value })} />
            </div>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Expense For</label>
              <input value={ed.expenseFor} onChange={(e) => setEd({ ...ed, expenseFor: e.target.value })} />
            </div>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Trip</label>
              <select value={ed.tripId} onChange={(e) => setEd({ ...ed, tripId: e.target.value })}>
                <option value="">— none —</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.closedAt ? ' (closed)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: '0 0 14px' }}>
              <label>Attachment (invoice)</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => onPickEditFile(e.target.files?.[0] || null)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {edAttachment ? `📎 ${edAttachment.name} (new)` : editTarget.attachmentName ? `📎 ${editTarget.attachmentName} — leave blank to keep it` : 'No attachment'}
              </div>
            </div>
            {error && <div className="login-err show" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmEdit}>Save changes</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setEditTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {tripLedger && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={() => setTripLedger(null)}
        >
          <div className="card" style={{ width: 760, maxWidth: '96%', maxHeight: '88vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="toolbar" style={{ alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, flex: 1 }}>
                Trip Ledger — {tripLedger.name}
                {tripLedger.closedAt ? (
                  <span style={{ marginLeft: 8, color: '#15803d', fontWeight: 700, fontSize: 12 }}>✓ Paid / closed</span>
                ) : (
                  <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 700, fontSize: 12 }}>● Open</span>
                )}
              </h3>
              {!tripLedger.closedAt && (
                <button className="btn btn-sm btn-primary" onClick={() => openTripPay(tripLedger)}>Mark as Paid</button>
              )}
              <button className="btn btn-sm" onClick={() => setTripLedger(null)}>Close</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sales Person</th>
                  <th>Expense For</th>
                  <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tripLedgerRows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{spName(r.salesPersonId)}</td>
                    <td>{r.expenseFor}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(r.amount)}</td>
                    <td>
                      {r.paid ? (
                        <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>✅ Paid</span>
                      ) : (
                        <span style={{ color: '#b45309', fontWeight: 700, fontSize: 12 }}>● Unpaid</span>
                      )}
                    </td>
                  </tr>
                ))}
                {tripLedgerRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">No expenses tagged to this trip.</td>
                  </tr>
                )}
              </tbody>
              {tripLedgerRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 700 }}>Trip Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>
                      {inr(tripLedgerRows.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {tripPayTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
          onClick={() => setTripPayTarget(null)}
        >
          <div className="card" style={{ width: 360, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Mark trip as paid — {tripPayTarget.name}</h3>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              This marks every expense on this trip as paid and closes the trip.
            </div>
            <div className="field" style={{ margin: '0 0 10px' }}>
              <label>Payment mode</label>
              <select value={tripPayMode} onChange={(e) => setTripPayMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: '0 0 14px' }}>
              <label>Paid by</label>
              <input value={tripPayBy} onChange={(e) => setTripPayBy(e.target.value)} placeholder="Who paid it" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmTripPay}>Confirm paid</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setTripPayTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
