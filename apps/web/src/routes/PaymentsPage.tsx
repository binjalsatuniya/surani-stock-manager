import { useEffect, useState } from 'react';
import { buildWhatsappLink, PAYMENT_MODES, type DueLedgerGroup, type PayableGroup, type Party, type Payment, type PaymentDirection, type PaymentMode, type SalesPerson } from '@surani/shared';
import type { UnpaidInvoice } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';
import { exportDueLedgerPdf } from '../lib/pdfExport';

const MODES: PaymentMode[] = PAYMENT_MODES;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function PaymentsPage() {
  const can = usePermission();
  const { fill } = useWhatsappTemplates();
  const { selectedFy } = useFinancialYear();
  const { required } = useFieldSettings();
  const canRecord = can('record_payments');
  const canDeletePayment = can('delete_payments');
  const [rows, setRows] = useState<Payment[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState('');
  const [dir, setDir] = useState<PaymentDirection | ''>('');
  const [amount, setAmount] = useState('');
  const [tds, setTds] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [note, setNote] = useState('');
  const [unpaid, setUnpaid] = useState<UnpaidInvoice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Payable side: the creditor's outstanding purchase (inward) invoices, for dir='out'.
  const [unpaidPurchase, setUnpaidPurchase] = useState<UnpaidInvoice[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [spFilter, setSpFilter] = useState('');
  const [dueGroups, setDueGroups] = useState<DueLedgerGroup[]>([]);
  const [payables, setPayables] = useState<PayableGroup[]>([]);

  async function reload() {
    setRows(await api.payments.list({ fy: selectedFy || undefined }));
    api.ledger.payable().then(setPayables);
  }

  useEffect(() => {
    // All parties (debtors, creditors, and 'both') can be paid or receive payments.
    api.parties.list().then(setParties);
    api.salesPersons.list().then(setSalesPersons);
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFy]);

  async function reloadDueLedger() {
    setDueGroups(await api.ledger.due(spFilter || undefined));
  }

  useEffect(() => {
    reloadDueLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spFilter]);

  function onRemind(g: DueLedgerGroup) {
    const overdue = g.entries.filter((e) => e.dueDays !== null && e.dueDays <= 0);
    const overdueAmount = overdue.reduce((s, e) => s + e.balance, 0);
    // One line per outstanding invoice: number · date · amount.
    const invoiceList = g.entries
      .map((e) => `• Invoice ${e.invNo || '—'} · ${fmtDate(e.date)} · ₹${e.balance.toFixed(2)}`)
      .join('\n');
    const message = fill('paymentReminder', {
      partyName: g.party.name,
      balance: g.total.toFixed(2),
      overdueCount: String(overdue.length),
      overdueAmount: overdueAmount.toFixed(2),
      invoiceList,
      date: fmtDate(new Date().toISOString()),
    });
    if (message) window.open(buildWhatsappLink(g.party.phone, message), '_blank');
  }

  function openWhatsapp(phone?: string | null) {
    if (!phone) return;
    window.open(buildWhatsappLink(phone, ''), '_blank');
  }

  function callPhone(phone?: string | null) {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
  }

  function onExportDuePdf() {
    const spName = spFilter ? salesPersons.find((s) => s.id === spFilter)?.name || 'Unknown' : 'All Sales Persons';
    exportDueLedgerPdf(dueGroups, spName);
  }

  // One party's dues as a printable PDF, then open their WhatsApp chat so the downloaded file can
  // be attached. Browsers can't attach a file to WhatsApp automatically, so this is a two-part flow.
  function onPartyDuesPdf(g: DueLedgerGroup) {
    exportDueLedgerPdf([g], g.party.name);
    if (g.party.phone) openWhatsapp(g.party.phone);
  }

  useEffect(() => {
    setSelected(new Set());
    setSelectedPurchase(new Set());
    if (partyId && dir === 'in') {
      api.payments.unpaidInvoices(partyId).then(setUnpaid);
      setUnpaidPurchase([]);
    } else if (partyId && dir === 'out') {
      api.payments.unpaidPurchaseInvoices(partyId).then(setUnpaidPurchase);
      setUnpaid([]);
    } else {
      setUnpaid([]);
      setUnpaidPurchase([]);
    }
  }, [partyId, dir]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePurchase(id: string) {
    setSelectedPurchase((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalSelected = unpaid
    .filter((u) => selected.has(u.outwardId))
    .reduce((s, u) => s + u.balance, 0);
  const totalSelectedPurchase = unpaidPurchase
    .filter((u) => selectedPurchase.has(u.outwardId))
    .reduce((s, u) => s + u.balance, 0);

  async function onAdd() {
    setError('');
    if (!partyId || !dir || !amount) return;
    if (required('payment.note') && !note.trim()) return setError('Note is required.');
    try {
      await api.payments.create({
        date,
        partyId,
        dir,
        amount: Number(amount),
        tdsAmount: tds ? Number(tds) : undefined,
        mode,
        note: note.trim() || null,
        outwardIds: dir === 'in' ? Array.from(selected) : undefined,
        inwardIds: dir === 'out' ? Array.from(selectedPurchase) : undefined,
      });
      setAmount('');
      setTds('');
      setPartyId('');
      setDir('');
      setNote('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this payment?')) return;
    await api.payments.remove(id);
    reload();
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Payment Due</h2>
      {canRecord && (
        <>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Party</label>
              <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">Select…</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Direction</label>
              <select value={dir} onChange={(e) => setDir(e.target.value as PaymentDirection)}>
                <option value="">Select…</option>
                <option value="in">Received</option>
                <option value="out">Paid</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Amount (cash)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label title="Tax Deducted at Source. Leave blank if none.">TDS</label>
              <input value={tds} onChange={(e) => setTds(e.target.value)} placeholder="0" style={{ width: 80 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
              <FieldLabel required={required('payment.note')}>Note</FieldLabel>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Remarks…" />
            </div>
            <button className="btn btn-primary" onClick={onAdd}>
              Record Payment
            </button>
          </div>
          {Number(tds) > 0 && Number(amount) >= 0 && (
            <div className="muted" style={{ marginBottom: 8 }}>
              Cash {Number(amount || 0).toFixed(2)} + TDS {Number(tds).toFixed(2)} ={' '}
              <strong>{(Number(amount || 0) + Number(tds)).toFixed(2)}</strong> settled against invoices.
            </div>
          )}
          {partyId && (() => {
            const p = parties.find((x) => x.id === partyId);
            return p && Number(p.opening) > 0 ? (
              <div style={{ marginBottom: 10, color: '#b45309', fontSize: 13 }}>
                💡 Opening balance for <strong>{p.name}</strong>: ₹{Number(p.opening).toFixed(2)} — this is also
                pending (it isn’t tied to a specific invoice, so it settles into the party’s general balance).
              </div>
            ) : null;
          })()}
          {dir === 'in' && partyId && (
            <div style={{ marginBottom: 16 }}>
              {unpaid.length === 0 ? (
                <div className="muted">No outstanding invoices for this party.</div>
              ) : (
                <>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Select invoices to allocate this payment against (FIFO within selection). Selected total:{' '}
                    <strong>{totalSelected.toFixed(2)}</strong>
                  </div>
                  {unpaid.map((u) => (
                    <label key={u.outwardId} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(u.outwardId)}
                        onChange={() => toggle(u.outwardId)}
                      />
                      <span>
                        {u.invNo || 'No invoice no.'} · {u.date} · Due {u.dueDate} (
                        {u.dueDays !== null && u.dueDays < 0 ? `${-u.dueDays}d overdue` : `${u.dueDays}d left`}) — balance{' '}
                        {u.balance.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
          {dir === 'out' && partyId && (
            <div style={{ marginBottom: 16 }}>
              {unpaidPurchase.length === 0 ? (
                <div className="muted">No outstanding purchase invoices for this creditor.</div>
              ) : (
                <>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Select purchase invoices this payment settles (FIFO within selection). Selected total:{' '}
                    <strong>{totalSelectedPurchase.toFixed(2)}</strong>
                  </div>
                  {unpaidPurchase.map((u) => (
                    <label key={u.outwardId} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={selectedPurchase.has(u.outwardId)}
                        onChange={() => togglePurchase(u.outwardId)}
                      />
                      <span>
                        {u.invNo || 'No invoice no.'} · {u.date} — balance {u.balance.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
      {error && <div className="login-err show">{error}</div>}

      {/* Outstanding dues from debtors (money to collect) — shown first */}
      <div style={{ marginTop: 12, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
        <div className="toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>Outstanding Dues <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>— money to collect from debtors</span></h3>
          <div className="field" style={{ margin: 0 }}>
            <label>Sales Person</label>
            <select value={spFilter} onChange={(e) => setSpFilter(e.target.value)}>
              <option value="">All Sales Persons</option>
              {salesPersons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm btn-primary" onClick={onExportDuePdf}>
            Export PDF
          </button>
        </div>
        {dueGroups.length === 0 ? (
          <div className="muted">No outstanding dues for this selection.</div>
        ) : (
          dueGroups.map((g) => (
            <div key={g.party.id} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>
                  {g.party.name} — <span className="num">{g.total.toFixed(2)}</span>
                </span>
                {g.party.phone && (
                  <button className="btn btn-sm" onClick={() => callPhone(g.party.phone)} title={`Call ${g.party.phone}`}>
                    📞 Call
                  </button>
                )}
                {can('send_whatsapp') && g.party.phone && (
                  <>
                    <button className="btn btn-sm btn-whatsapp" onClick={() => openWhatsapp(g.party.phone)} title="Open WhatsApp chat with this party">
                      WhatsApp
                    </button>
                    <button className="btn btn-sm" onClick={() => onRemind(g)} title="Send payment reminder on WhatsApp">
                      Remind
                    </button>
                  </>
                )}
                <button
                  className="btn btn-sm"
                  onClick={() => onPartyDuesPdf(g)}
                  title="Download this party's dues as a PDF (and open their WhatsApp to attach it)"
                >
                  📄 Dues PDF
                </button>
              </div>
              <table>
                <tbody>
                  {g.entries.map((e) => (
                    <tr key={e.outwardId}>
                      <td>{e.invNo || 'No invoice no.'}</td>
                      <td>{e.date}</td>
                      <td>Due {e.dueDate}</td>
                      <td>{e.dueDays !== null && e.dueDays < 0 ? `${-e.dueDays}d overdue` : `${e.dueDays}d left`}</td>
                      <td>{e.balance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Party</th>
            <th>Direction</th>
            <th>Amount</th>
            <th>TDS</th>
            <th>Mode</th>
            {canRecord && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.date}</td>
              <td>{partyName(p.partyId)}</td>
              <td>{p.dir === 'in' ? 'Received' : 'Paid'}</td>
              <td>{p.amount}</td>
              <td>{p.tdsAmount ? p.tdsAmount : '—'}</td>
              <td>{p.mode}</td>
              {canRecord && (
                <td>
                  {canDeletePayment && (
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(p.id)}>
                      Delete
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No payments recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pending payments to creditors (money we owe) */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
        <h3 style={{ marginTop: 0 }}>Pending Payments to Creditors <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>— money you owe</span></h3>
        <table>
          <thead>
            <tr>
              <th>Creditor</th>
              <th>Phone</th>
              <th>Amount Payable (₹)</th>
              {canRecord && <th></th>}
            </tr>
          </thead>
          <tbody>
            {payables.map((g) => (
              <tr key={g.party.id}>
                <td>{g.party.name}</td>
                <td>{g.party.phone || '—'}</td>
                <td style={{ fontWeight: 700, color: '#ef4444' }}>{g.amount.toFixed(2)}</td>
                {canRecord && (
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {g.party.phone && (
                        <button className="btn btn-sm" onClick={() => callPhone(g.party.phone)} title={`Call ${g.party.phone}`}>
                          📞 Call
                        </button>
                      )}
                      {can('send_whatsapp') && g.party.phone && (
                        <button className="btn btn-sm btn-whatsapp" onClick={() => openWhatsapp(g.party.phone)} title="Open WhatsApp chat with this creditor">
                          WhatsApp
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setPartyId(g.party.id);
                          setDir('out');
                          setAmount(String(g.amount));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Pay
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {payables.length === 0 && (
              <tr>
                <td colSpan={canRecord ? 4 : 3} className="muted">No pending payments to creditors.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
