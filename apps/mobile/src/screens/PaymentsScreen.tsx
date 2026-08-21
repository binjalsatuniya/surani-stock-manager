import { fmtMoney, fmtAmount } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  buildWhatsappLink,
  buildTelLink,
  PAYMENT_MODES,
  type DueLedgerGroup,
  type PayableGroup,
  type Party,
  type Payment,
  type PaymentDirection,
  type PaymentMode,
  type SalesPerson,
  type UnpaidInvoice,
} from '@surani/shared';
import { api } from '../lib/apiClient';
import { SearchSelect } from '../components/SearchSelect';
import { usePermission } from '../hooks/usePermission';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const inr = (n: number) => fmtMoney(n);
const today = () => new Date().toISOString().slice(0, 10);

const dueLabel = (dueDays: number | null) =>
  dueDays === null ? 'No due date' : dueDays < 0 ? `${-dueDays}d overdue` : `${dueDays}d left`;

export function PaymentsScreen() {
  const can = usePermission();
  const { required } = useFieldSettings();
  const { fill } = useWhatsappTemplates();
  const canRecord = can('record_payments');
  const canDeletePayment = can('delete_payments');

  const [rows, setRows] = useState<Payment[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [dueGroups, setDueGroups] = useState<DueLedgerGroup[]>([]);
  const [payables, setPayables] = useState<PayableGroup[]>([]);
  const [spFilter, setSpFilter] = useState('');

  const [date, setDate] = useState(today());
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
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    setRows(await api.payments.list());
    api.ledger.payable().then(setPayables).catch(() => {});
  }

  useEffect(() => {
    // All parties (debtors, creditors, and 'both') can be paid or receive payments.
    api.parties.list().then(setParties).catch(() => {});
    api.salesPersons.list().then(setSalesPersons).catch(() => {});
    reload().catch(() => {});
  }, []);

  useEffect(() => {
    api.ledger.due(spFilter || undefined).then(setDueGroups).catch(() => {});
  }, [spFilter]);

  // Allocating a receipt against specific invoices only applies to money coming in.
  useEffect(() => {
    setSelected(new Set());
    setSelectedPurchase(new Set());
    if (partyId && dir === 'in') {
      api.payments.unpaidInvoices(partyId).then(setUnpaid).catch(() => {});
      setUnpaidPurchase([]);
    } else if (partyId && dir === 'out') {
      api.payments.unpaidPurchaseInvoices(partyId).then(setUnpaidPurchase).catch(() => {});
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

  const totalSelected = unpaid.filter((u) => selected.has(u.outwardId)).reduce((s, u) => s + u.balance, 0);
  const totalSelectedPurchase = unpaidPurchase
    .filter((u) => selectedPurchase.has(u.outwardId))
    .reduce((s, u) => s + u.balance, 0);
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;

  async function onAdd() {
    setError('');
    if (!partyId || !dir || !amount) {
      setError('Party, direction and amount are required.');
      return;
    }
    if (required('payment.note') && !note.trim()) return setError('Note is required.');
    setSaving(true);
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
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  function onDelete(p: Payment) {
    Alert.alert('Delete payment', `Delete this ${p.dir === 'in' ? 'receipt' : 'payment'} of ${inr(Number(p.amount))}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.payments.remove(p.id);
            await reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete payment');
          }
        },
      },
    ]);
  }

  function openWhatsapp(phone?: string | null) {
    if (!phone) return;
    Linking.openURL(buildWhatsappLink(phone, '')).catch(() => setError('Could not open WhatsApp on this phone.'));
  }

  function callPhone(phone?: string | null) {
    if (!phone) return;
    Linking.openURL(buildTelLink(phone)).catch(() => setError('Could not start a call on this phone.'));
  }

  function onRemind(g: DueLedgerGroup) {
    const overdue = g.entries.filter((e) => e.dueDays !== null && e.dueDays <= 0);
    const overdueAmount = overdue.reduce((s, e) => s + e.balance, 0);
    // One line per outstanding invoice: number · date · amount.
    const invoiceList = g.entries
      .map((e) => `• Invoice ${e.invNo || '—'} · ${fmtDate(e.date)} · ₹${fmtAmount(e.balance)}`)
      .join('\n');
    const message = fill('paymentReminder', {
      partyName: g.party.name,
      balance: fmtAmount(g.total),
      overdueCount: String(overdue.length),
      overdueAmount: fmtAmount(overdueAmount),
      invoiceList,
      date: fmtDate(new Date().toISOString()),
    });
    if (!message) return;
    Linking.openURL(buildWhatsappLink(g.party.phone, message)).catch(() =>
      setError('Could not open WhatsApp on this phone.')
    );
  }

  // Pre-fills the record form from a creditor's payable row, the way the web page's "Pay" button does.
  function payCreditor(g: PayableGroup) {
    setPartyId(g.party.id);
    setDir('out');
    setAmount(String(g.amount));
    setShowForm(true);
  }

  async function onExportDuePdf() {
    if (!dueGroups.length) {
      setError('No pending dues to export for this selection.');
      return;
    }
    const spName = spFilter ? salesPersons.find((s) => s.id === spFilter)?.name || 'Unknown' : 'All Sales Persons';
    const grandTotal = dueGroups.reduce((s, g) => s + g.total, 0);
    const partyBlocks = dueGroups
      .map(({ party, entries, total }) => {
        const body = entries
          .map(
            (e) =>
              `<tr><td>${e.invNo || '—'}</td><td>${fmtDate(e.date)}</td><td>${fmtDate(e.dueDate)}</td><td>${dueLabel(
                e.dueDays
              )}</td><td style="text-align:right">${inr(e.balance)}</td></tr>`
          )
          .join('');
        return `<div class="party-block">
          <div class="party-name">${party.name}${party.phone ? ` &middot; ${party.phone}` : ''}</div>
          <table>
            <thead><tr><th>Invoice</th><th>Sale Date</th><th>Due Date</th><th>Status</th><th style="text-align:right">Amount (₹)</th></tr></thead>
            <tbody>${body}</tbody>
            <tfoot><tr><td colspan="4">Total due — ${party.name}</td><td style="text-align:right">${inr(total)}</td></tr></tfoot>
          </table>
        </div>`;
      })
      .join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Roboto,sans-serif;padding:24px;color:#0b1220}
      h1{font-size:18px;margin:0 0 4px}
      .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      .party-block{margin-bottom:18px}
      .party-name{font-weight:700;font-size:13px;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}
      th{background:#f5f7fb}
      tfoot td{font-weight:700}
      .grand-total{margin-top:16px;font-size:14px;font-weight:800;text-align:right}
    </style></head><body>
      <h1>SURANI AND SONS — Outstanding Dues Statement</h1>
      <div class="sub">Sales Person: <b>${spName}</b> &middot; Generated ${fmtDate(new Date().toISOString())}</div>
      ${partyBlocks}
      <div class="grand-total">Grand Total: ${inr(grandTotal)}</div>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.');
    }
  }

  // One party's outstanding-dues PDF, then straight to the share sheet — pick WhatsApp + that party
  // to send them their own pending amount as a real PDF attachment.
  async function onSendPartyDuesPdf(g: DueLedgerGroup) {
    setError('');
    const body = g.entries
      .map(
        (e) =>
          `<tr><td>${e.invNo || '—'}</td><td>${fmtDate(e.date)}</td><td>${fmtDate(e.dueDate)}</td><td>${dueLabel(
            e.dueDays
          )}</td><td style="text-align:right">${inr(e.balance)}</td></tr>`
      )
      .join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Roboto,sans-serif;padding:24px;color:#0b1220}
      h1{font-size:18px;margin:0 0 2px}
      .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-bottom:1px solid #e2e8f0;padding:7px 6px;text-align:left}
      th{background:#f5f7fb}
      tfoot td{font-weight:700}
      .total{margin-top:14px;font-size:15px;font-weight:800;text-align:right;color:#b91c1c}
    </style></head><body>
      <h1>SURANI AND SONS — Outstanding Dues</h1>
      <div class="sub">${g.party.name}${g.party.phone ? ` &middot; ${g.party.phone}` : ''} &middot; As on ${fmtDate(
        new Date().toISOString()
      )}</div>
      <table>
        <thead><tr><th>Invoice</th><th>Sale Date</th><th>Due Date</th><th>Status</th><th style="text-align:right">Amount (₹)</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="4">Total Outstanding</td><td style="text-align:right">${inr(g.total)}</td></tr></tfoot>
      </table>
      <div class="total">Total Due: ${inr(g.total)}</div>
      <div class="sub" style="margin-top:16px">Thank you — Surani and Sons</div>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Send ${g.party.name}'s dues on WhatsApp` });
      } else {
        setError('Sharing is not available on this phone.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {canRecord && !showForm && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>＋ Record Payment</Text>
        </TouchableOpacity>
      )}

      {canRecord && showForm && (
        <View style={[styles.card, styles.accentCard]}>
          <Text style={styles.cardTitle}>Record Payment</Text>

          <Text style={styles.label}>Date</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

          <Text style={styles.label}>Party *</Text>
          <SearchSelect
            value={partyId}
            onChange={setPartyId}
            options={parties.map((p) => ({ id: p.id, label: p.name }))}
            placeholder="Select…"
          />

          <Text style={styles.label}>Direction *</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={dir} onValueChange={(v) => setDir(v as PaymentDirection | '')} style={styles.picker}>
              <Picker.Item label="Select…" value="" />
              <Picker.Item label="Received (money in)" value="in" />
              <Picker.Item label="Paid (money out)" value="out" />
            </Picker>
          </View>
          {(() => {
            const p = parties.find((x) => x.id === partyId);
            return p && Number(p.opening) > 0 ? (
              <Text style={styles.openingHint}>
                💡 Opening balance for {p.name}: {inr(Number(p.opening))} — also pending (settles into the party's general balance).
              </Text>
            ) : null;
          })()}
          {!!partyId && dir !== 'in' ? (
            <Text style={styles.hint}>Choose “Received” to pick which of this party's invoices the payment settles.</Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Amount (cash) *</Text>
              <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>TDS</Text>
              <TextInput style={styles.input} value={tds} onChangeText={setTds} keyboardType="numeric" placeholder="0" />
            </View>
          </View>
          {Number(tds) > 0 ? (
            <Text style={styles.hint}>
              Cash {fmtAmount(Number(amount) || 0)} + TDS {fmtAmount(tds)} ={' '}
              {fmtAmount((Number(amount) || 0) + Number(tds))} settled against invoices.
            </Text>
          ) : null}

          <Text style={styles.label}>Mode</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={mode} onValueChange={(v) => setMode(v as PaymentMode)} style={styles.picker}>
              {PAYMENT_MODES.map((m) => (
                <Picker.Item key={m} label={m} value={m} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>
            Note{required('payment.note') ? <Text style={styles.req}> *</Text> : null}
          </Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Remarks…" />

          {dir === 'in' && !!partyId && (
            <View style={styles.allocBox}>
              {unpaid.length === 0 ? (
                <Text style={styles.hint}>No outstanding invoices for this party.</Text>
              ) : (
                <>
                  <Text style={styles.hint}>
                    Select invoices to allocate this payment against (FIFO within selection). Selected total:{' '}
                    {inr(totalSelected)}
                  </Text>
                  {unpaid.map((u) => {
                    const on = selected.has(u.outwardId);
                    return (
                      <TouchableOpacity key={u.outwardId} style={styles.allocRow} onPress={() => toggle(u.outwardId)}>
                        <Text style={[styles.checkbox, on && styles.checkboxOn]}>{on ? '☑' : '☐'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.allocTitle}>{u.invNo || 'No invoice no.'}</Text>
                          <Text style={styles.allocMeta}>
                            {fmtDate(u.date)} · Due {fmtDate(u.dueDate)} ({dueLabel(u.dueDays)})
                          </Text>
                        </View>
                        <Text style={styles.allocAmt}>{inr(u.balance)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          )}

          {dir === 'out' && !!partyId && (
            <View style={styles.allocBox}>
              {unpaidPurchase.length === 0 ? (
                <Text style={styles.hint}>No outstanding purchase invoices for this creditor.</Text>
              ) : (
                <>
                  <Text style={styles.hint}>
                    Select purchase invoices this payment settles (FIFO within selection). Selected total:{' '}
                    {inr(totalSelectedPurchase)}
                  </Text>
                  {unpaidPurchase.map((u) => {
                    const on = selectedPurchase.has(u.outwardId);
                    return (
                      <TouchableOpacity key={u.outwardId} style={styles.allocRow} onPress={() => togglePurchase(u.outwardId)}>
                        <Text style={[styles.checkbox, on && styles.checkboxOn]}>{on ? '☑' : '☐'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.allocTitle}>{u.invNo || 'No invoice no.'}</Text>
                          <Text style={styles.allocMeta}>{fmtDate(u.date)}</Text>
                        </View>
                        <Text style={styles.allocAmt}>{inr(u.balance)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={onAdd} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Record Payment'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnGhost, styles.col]}
              onPress={() => {
                setShowForm(false);
                setError('');
              }}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!showForm && error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Outstanding dues from debtors (money to collect) — shown first, as on the web */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Outstanding Dues</Text>
        <Text style={styles.sectionSub}>Money to collect from debtors</Text>

        <Text style={styles.label}>Sales Person</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={spFilter} onValueChange={setSpFilter} style={styles.picker}>
            <Picker.Item label="All Sales Persons" value="" />
            {salesPersons.map((s) => (
              <Picker.Item key={s.id} label={s.name} value={s.id} />
            ))}
          </Picker>
        </View>

        {dueGroups.map((g) => (
          <View key={g.party.id} style={styles.dueGroup}>
            <View style={styles.cardHead}>
              <Text style={styles.dueParty}>{g.party.name}</Text>
              <Text style={styles.dueTotal}>{inr(g.total)}</Text>
            </View>
            {g.entries.map((e) => (
              <View key={e.outwardId} style={styles.dueRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.allocTitle}>{e.invNo || 'No invoice no.'}</Text>
                  <Text style={styles.allocMeta}>
                    {fmtDate(e.date)} · Due {fmtDate(e.dueDate)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.allocAmt}>{inr(e.balance)}</Text>
                  <Text style={[styles.allocMeta, e.dueDays !== null && e.dueDays < 0 ? styles.overdue : null]}>
                    {dueLabel(e.dueDays)}
                  </Text>
                </View>
              </View>
            ))}
            {(can('send_whatsapp') || !!g.party.phone) && (
              <View style={styles.actions}>
                {!!g.party.phone && (
                  <TouchableOpacity style={styles.btnSmCall} onPress={() => callPhone(g.party.phone)}>
                    <Text style={styles.btnSmCallText}>📞 Call</Text>
                  </TouchableOpacity>
                )}
                {can('send_whatsapp') && (
                  <TouchableOpacity style={styles.btnSmWa} onPress={() => onSendPartyDuesPdf(g)}>
                    <Text style={styles.btnSmWaText}>📄 Send Dues PDF</Text>
                  </TouchableOpacity>
                )}
                {can('send_whatsapp') && !!g.party.phone && (
                  <>
                    <TouchableOpacity style={styles.btnSm} onPress={() => openWhatsapp(g.party.phone)}>
                      <Text style={styles.btnSmText}>Chat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnSm} onPress={() => onRemind(g)}>
                      <Text style={styles.btnSmText}>Remind</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        ))}
        {dueGroups.length === 0 ? <Text style={styles.empty}>No outstanding dues for this selection.</Text> : null}

        {dueGroups.length > 0 && (
          <TouchableOpacity style={styles.btn} onPress={onExportDuePdf}>
            <Text style={styles.btnText}>Export PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pending payments to creditors (money we owe) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pending Payments to Creditors</Text>
        <Text style={styles.sectionSub}>Money you owe</Text>
        {payables.map((g) => (
          <View key={g.party.id} style={styles.dueRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.allocTitle}>{g.party.name}</Text>
              <Text style={styles.allocMeta}>{g.party.phone || '—'}</Text>
            </View>
            <Text style={styles.payable}>{inr(g.amount)}</Text>
            {!!g.party.phone && (
              <TouchableOpacity style={styles.btnSmCall} onPress={() => callPhone(g.party.phone)}>
                <Text style={styles.btnSmCallText}>📞</Text>
              </TouchableOpacity>
            )}
            {canRecord && (
              <>
                {can('send_whatsapp') && !!g.party.phone && (
                  <TouchableOpacity style={styles.btnSmWa} onPress={() => openWhatsapp(g.party.phone)}>
                    <Text style={styles.btnSmWaText}>WA</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.btnSmPrimary} onPress={() => payCreditor(g)}>
                  <Text style={styles.btnSmPrimaryText}>Pay</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
        {payables.length === 0 ? <Text style={styles.empty}>No pending payments to creditors.</Text> : null}
      </View>

      {/* Recorded payments */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payments</Text>
        {rows.map((p) => (
          <View key={p.id} style={styles.dueRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.allocTitle}>{partyName(p.partyId)}</Text>
              <Text style={styles.allocMeta}>
                {fmtDate(p.date)} · {p.mode}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.allocAmt, p.dir === 'in' ? styles.in : styles.out]}>
                {p.dir === 'in' ? '+' : '−'}
                {inr(Number(p.amount))}
              </Text>
              <Text style={styles.allocMeta}>
                {p.dir === 'in' ? 'Received' : 'Paid'}
                {p.tdsAmount ? ` · TDS ${fmtAmount(p.tdsAmount)}` : ''}
              </Text>
            </View>
            {canDeletePayment && (
              <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(p)}>
                <Text style={styles.btnSmDangerText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {rows.length === 0 ? <Text style={styles.empty}>No payments recorded yet.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  accentCard: { borderWidth: 1, borderColor: '#0d9488' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  sectionSub: { color: '#94a3b8', fontSize: 11.5, marginTop: 2 },

  label: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  req: { color: '#ef4444', fontWeight: '700' },
  hint: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  openingHint: { color: '#b45309', fontSize: 11.5, marginTop: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  allocBox: { marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10 },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkbox: { fontSize: 18, color: '#94a3b8' },
  checkboxOn: { color: '#0d9488' },
  allocTitle: { fontWeight: '600', fontSize: 13, color: '#0b1220' },
  allocMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  allocAmt: { fontWeight: '700', fontSize: 13, color: '#0b1220' },
  overdue: { color: '#dc2626', fontWeight: '700' },
  in: { color: '#16a34a' },
  out: { color: '#dc2626' },
  payable: { fontWeight: '700', fontSize: 13, color: '#ef4444' },

  dueGroup: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginTop: 10 },
  dueParty: { fontWeight: '700', fontSize: 13.5, color: '#0b1220' },
  dueTotal: { fontWeight: '800', fontSize: 13.5, color: '#ef4444' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnSm: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  btnSmPrimary: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSmWa: { backgroundColor: '#25d366', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmWaText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSmCall: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmCallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 12, marginBottom: 4, fontSize: 12.5 },
});
