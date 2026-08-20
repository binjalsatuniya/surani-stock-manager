import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { buildWhatsappLink, PAYMENT_MODES, type SalesPerson, type SalesPersonExpense, type Trip } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';

// earliest allowed date = base minus N days (YYYY-MM-DD).
function minusDays(baseYmd: string, days: number): string {
  const d = new Date(baseYmd + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n: number) => `₹${n.toFixed(2)}`;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // ~5 MB — matches the web page and the API's 7M base64 cap.

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  date: today(),
  salesPersonId: '',
  amount: '',
  expenseFor: '',
  tripId: '',
};

type Attachment = { data: string; name: string };

// Strips the `data:<mime>;base64,` prefix — the API stores a full data URL, but writing the file
// back out to disk (to view/share it) needs the raw base64 payload and the mime type separately.
function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return { mime: 'application/octet-stream', base64: '' };
  return { mime: match[1] || 'application/octet-stream', base64: match[2] || '' };
}

const extForMime = (mime: string) => (mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg');

export function ExpensesScreen() {
  const { user } = useAuth();
  const can = usePermission();
  const canDelete = can('delete_expenses');
  const canEditExpense = can('edit_expenses');
  const canEdit = can('add_expenses') || canEditExpense || canDelete;
  const [rule, setRule] = useState<{ backdateDays: number | null; today: string } | null>(null);
  const [ruleInput, setRuleInput] = useState('');
  const [ruleMsg, setRuleMsg] = useState('');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [rows, setRows] = useState<SalesPersonExpense[]>([]);
  const [filterSp, setFilterSp] = useState('');
  const [form, setForm] = useState({ ...EMPTY });
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  // A picked attachment goes to the add form or the edit dialog, depending on which opened the picker.
  const [attachFor, setAttachFor] = useState<'add' | 'edit'>('add');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // The sales person whose dedicated ledger is open (null = none).
  const [ledgerSpId, setLedgerSpId] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<SalesPersonExpense[]>([]);
  // Trips: a named grouping expenses can be tagged with.
  const canManageTrips = can('manage_expense_trips');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [newTripName, setNewTripName] = useState('');
  const loadTrips = () => api.trips.list().then(setTrips).catch(() => {});
  const [tripLedger, setTripLedger] = useState<Trip | null>(null);
  const [tripLedgerRows, setTripLedgerRows] = useState<SalesPersonExpense[]>([]);
  // Image attachment being previewed full-screen (data URL).
  const [preview, setPreview] = useState<{ uri: string; name: string } | null>(null);
  // Editing an existing expense (needs edit_expenses).
  const [editTarget, setEditTarget] = useState<SalesPersonExpense | null>(null);
  const [ed, setEd] = useState({ date: '', salesPersonId: '', amount: '', expenseFor: '', tripId: '' });
  const [edAttachment, setEdAttachment] = useState<Attachment | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function reload() {
    setRows(await api.expenses.list({ salesPersonId: filterSp || undefined }));
  }

  useEffect(() => {
    api.salesPersons.list().then(setSalesPersons).catch(() => {});
    loadTrips();
    api.expenses.getRule().then((r) => {
      setRule(r);
      setRuleInput(r.backdateDays === null ? '' : String(r.backdateDays));
    }).catch(() => {});
  }, []);

  async function onSaveRule() {
    setRuleMsg('');
    const n = ruleInput.trim() === '' ? null : Math.max(0, Math.floor(Number(ruleInput)));
    if (ruleInput.trim() !== '' && Number.isNaN(Number(ruleInput))) return setRuleMsg('Enter a number, or blank for no limit.');
    try {
      const r = await api.expenses.setRule(n);
      setRule(r);
      setRuleMsg('Saved.');
    } catch (e) {
      setRuleMsg(e instanceof Error ? e.message : 'Failed to save rule');
    }
  }

  useEffect(() => {
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSp]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm({ ...EMPTY });
    setAttachment(null);
    setShowForm(false);
    setError('');
  }

  const spName = (id: string) => salesPersons.find((s) => s.id === id)?.name || id;

  function openLedger(id: string) {
    setLedgerSpId(id);
    api.expenses.list({ salesPersonId: id }).then(setLedgerRows).catch(() => {});
  }

  /* ---------- attachment capture ---------- */

  function tooBig(size: number | undefined) {
    if (size && size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment is too large (max 5 MB). Please attach a smaller image or PDF.');
      return true;
    }
    return false;
  }

  // Deliver a picked attachment to whichever form opened the picker.
  function applyPicked(att: Attachment) {
    if (attachFor === 'edit') setEdAttachment(att);
    else setAttachment(att);
  }

  async function pickFromCamera() {
    setError('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission was denied. Allow camera access to photograph a bill.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (tooBig(a.fileSize) || !a.base64) return;
    applyPicked({ data: `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`, name: a.fileName || `bill-${Date.now()}.jpg` });
  }

  async function pickFromGallery() {
    setError('');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (tooBig(a.fileSize) || !a.base64) return;
    applyPicked({ data: `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`, name: a.fileName || `bill-${Date.now()}.jpg` });
  }

  async function pickDocument() {
    setError('');
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (tooBig(a.size)) return;
    try {
      const base64 = new File(a.uri).base64Sync();
      applyPicked({ data: `data:${a.mimeType || 'application/pdf'};base64,${base64}`, name: a.name || 'attachment.pdf' });
    } catch {
      setError('Could not read that file. Please try another one.');
    }
  }

  function chooseAttachment(mode: 'add' | 'edit' = 'add') {
    setAttachFor(mode);
    Alert.alert('Attach invoice', 'Where is the bill?', [
      { text: 'Take Photo', onPress: pickFromCamera },
      { text: 'Choose from Gallery', onPress: pickFromGallery },
      { text: 'Choose a PDF / File', onPress: pickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  /* ---------- attachment viewing ---------- */

  // Images preview inline; anything else (PDFs attached from the website) is written to the cache
  // and handed to the OS, which is the phone equivalent of the web page's download link.
  async function openAttachment(exp: SalesPersonExpense) {
    if (!exp.attachment) return;
    const { mime, base64 } = splitDataUrl(exp.attachment);
    if (mime.startsWith('image/')) {
      setPreview({ uri: exp.attachment, name: exp.attachmentName || 'attachment' });
      return;
    }
    await shareBase64(base64, mime, exp.attachmentName || `attachment.${extForMime(mime)}`);
  }

  async function shareBase64(base64: string, mime: string, name: string) {
    try {
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime });
      else await Linking.openURL(file.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that attachment.');
    }
  }

  async function saveImagePreview() {
    if (!preview) return;
    const { mime, base64 } = splitDataUrl(preview.uri);
    await shareBase64(base64, mime, preview.name || `attachment.${extForMime(mime)}`);
  }

  /* ---------- create / delete ---------- */

  async function onAdd() {
    setError('');
    if (!form.salesPersonId) return setError('Please select a sales person.');
    if (!form.amount) return setError('Please enter an amount.');
    if (!form.expenseFor.trim()) return setError('Please enter what the expense is for.');
    // Enforce the back-dating rule up front (the server enforces it too).
    if (rule) {
      if (form.date > rule.today) return setError("Expense date can't be in the future.");
      if (rule.backdateDays !== null) {
        const earliest = minusDays(rule.today, rule.backdateDays);
        if (form.date < earliest)
          return setError(
            rule.backdateDays === 0
              ? 'Only today’s expenses can be added.'
              : `Expenses can be dated at most ${rule.backdateDays} day(s) back (not before ${earliest}).`
          );
      }
    }
    setSaving(true);
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
      setShowForm(false);
      await reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  }

  // Marking paid opens a dialog for mode + who paid; unmarking clears it.
  const [payTarget, setPayTarget] = useState<SalesPersonExpense | null>(null);
  const [payBy, setPayBy] = useState('');
  const [payMode, setPayMode] = useState<string>('Cash');

  async function onTogglePaid(exp: SalesPersonExpense) {
    setError('');
    if (exp.paid) {
      try {
        await api.expenses.setPaid(exp.id, false);
        await reload();
        if (ledgerSpId) openLedger(ledgerSpId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update paid status');
      }
    } else {
      setPayBy(user?.name || '');
      setPayMode('Cash');
      setPayTarget(exp);
    }
  }

  async function confirmPay() {
    if (!payTarget) return;
    try {
      await api.expenses.setPaid(payTarget.id, true, { paidBy: payBy.trim() || null, paidMode: payMode });
      setPayTarget(null);
      await reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update paid status');
    }
  }

  async function createTrip() {
    const name = newTripName.trim();
    if (!name) return;
    try {
      await api.trips.create({ name });
      setNewTripName('');
      await loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add trip');
    }
  }
  async function closeTrip(t: Trip) {
    try {
      await api.trips.setClosed(t.id, !t.closedAt);
      await loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update trip');
    }
  }
  function openTripLedger(t: Trip) {
    setTripLedger(t);
    setTripLedgerRows([]);
    api.expenses.list({ tripId: t.id }).then(setTripLedgerRows).catch(() => setTripLedgerRows([]));
  }
  function deleteTrip(id: string) {
    Alert.alert('Delete trip', 'Delete this trip? Tagged expenses just lose the tag — they are not deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.trips.remove(id);
            await loadTrips();
            await reload();
            if (ledgerSpId) openLedger(ledgerSpId);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete trip');
          }
        },
      },
    ]);
  }

  function openEdit(exp: SalesPersonExpense) {
    setError('');
    setEditTarget(exp);
    setEd({ date: exp.date.slice(0, 10), salesPersonId: exp.salesPersonId, amount: String(exp.amount), expenseFor: exp.expenseFor, tripId: exp.tripId || '' });
    setEdAttachment(null);
  }

  async function confirmEdit() {
    if (!editTarget) return;
    setError('');
    if (!ed.salesPersonId) return setError('Please select a sales person.');
    if (!ed.amount) return setError('Please enter an amount.');
    if (!ed.expenseFor.trim()) return setError('Please enter what the expense is for.');
    // The back-dating rule only bites when the date is actually changed (matches the server).
    if (rule && ed.date !== editTarget.date.slice(0, 10)) {
      if (ed.date > rule.today) return setError("Expense date can't be in the future.");
      if (rule.backdateDays !== null) {
        const earliest = minusDays(rule.today, rule.backdateDays);
        if (ed.date < earliest)
          return setError(
            rule.backdateDays === 0
              ? 'Only today’s date is allowed by the expense date rule.'
              : `An expense can be dated at most ${rule.backdateDays} day(s) back (not before ${earliest}).`
          );
      }
    }
    setSavingEdit(true);
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
      setEdAttachment(null);
      await reload();
      if (ledgerSpId) openLedger(ledgerSpId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit expense');
    } finally {
      setSavingEdit(false);
    }
  }

  function onDelete(id: string) {
    Alert.alert('Delete expense', 'Delete this expense entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.expenses.remove(id);
            await reload();
            if (ledgerSpId) openLedger(ledgerSpId);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete expense');
          }
        },
      },
    ]);
  }

  /* ---------- ledger export / share ---------- */

  // Oldest-first so the running total accumulates in the same order as the web ledger.
  const orderedLedger = useMemo(
    () => [...ledgerRows].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)),
    [ledgerRows]
  );
  const ledgerTotal = ledgerRows.reduce((s, r) => s + r.amount, 0);

  async function onExportLedgerPdf() {
    if (!ledgerSpId) return;
    let running = 0;
    const body = orderedLedger
      .map((e) => {
        running += e.amount;
        return `<tr><td>${fmtDate(e.date)}</td><td>${e.expenseFor}</td><td style="text-align:right">${inr(
          e.amount
        )}</td><td style="text-align:right">${inr(running)}</td></tr>`;
      })
      .join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Roboto,sans-serif;padding:24px;color:#0b1220}
      h1{font-size:18px;margin:0 0 4px}
      .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-bottom:1px solid #e2e8f0;padding:7px 6px;text-align:left}
      th{background:#f5f7fb}
      tfoot td{font-weight:700}
    </style></head><body>
      <h1>SURANI AND SONS — Sales Person Expense Ledger</h1>
      <div class="sub">${spName(ledgerSpId)} &middot; Generated ${fmtDate(new Date().toISOString())}</div>
      <table>
        <thead><tr><th>Date</th><th>Expense For</th><th style="text-align:right">Amount (₹)</th><th style="text-align:right">Running Total (₹)</th></tr></thead>
        <tbody>
          <tr><td>—</td><td style="font-style:italic">Opening</td><td></td><td style="text-align:right">${inr(0)}</td></tr>
          ${body}
          <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing Total</td><td style="text-align:right">${inr(
            ledgerTotal
          )}</td><td style="text-align:right">${inr(ledgerTotal)}</td></tr>
        </tbody>
        <tfoot><tr><td colspan="2">Total Expense</td><td style="text-align:right">${inr(ledgerTotal)}</td><td></td></tr></tfoot>
      </table>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.');
    }
  }

  function onShareLedger() {
    if (!ledgerSpId) return;
    const sp = salesPersons.find((s) => s.id === ledgerSpId);
    let running = 0;
    const lines = orderedLedger.map((e) => {
      running += e.amount;
      return `${fmtDate(e.date)} — ${e.expenseFor}\n   ${inr(e.amount)}  (Total ${inr(running)})`;
    });
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
      `*Total Expense: ${inr(ledgerTotal)}*`,
      '',
      'Thank you 🙏',
    ].join('\n');
    Linking.openURL(buildWhatsappLink(sp?.phone, message)).catch(() => setError('Could not open WhatsApp.'));
  }

  /* ---------- derived ---------- */

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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {user?.isPrimary && (
        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Expense date rule</Text>
          <Text style={styles.ruleDesc}>How many days back can an expense be dated? 0 = only today. Blank = no limit.</Text>
          <View style={styles.ruleRow}>
            <TextInput
              style={styles.ruleInput}
              value={ruleInput}
              onChangeText={setRuleInput}
              keyboardType="numeric"
              placeholder="days"
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity style={styles.ruleBtn} onPress={onSaveRule}>
              <Text style={styles.btnText}>Save rule</Text>
            </TouchableOpacity>
          </View>
          {ruleMsg ? <Text style={styles.ruleMsg}>{ruleMsg}</Text> : null}
        </View>
      )}

      {canManageTrips && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trips</Text>
          <Text style={styles.ruleDesc}>Create a trip, then tag expenses to it.</Text>
          <View style={styles.ruleRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newTripName}
              onChangeText={setNewTripName}
              placeholder="New trip name (e.g. Mumbai — Aug)"
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity style={styles.ruleBtn} onPress={createTrip}>
              <Text style={styles.btnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {trips.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {trips.map((t) => (
                <View key={t.id} style={styles.tripRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripName}>{t.name}</Text>
                    <Text style={t.closedAt ? styles.tripClosed : styles.tripOpen}>{t.closedAt ? '✓ Paid / closed' : '● Open'}</Text>
                  </View>
                  <TouchableOpacity style={styles.btnSm} onPress={() => openTripLedger(t)}>
                    <Text style={styles.btnSmText}>Ledger</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnSm} onPress={() => closeTrip(t)}>
                    <Text style={styles.btnSmText}>{t.closedAt ? 'Reopen' : 'Paid'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnSmDanger} onPress={() => deleteTrip(t.id)}>
                    <Text style={styles.btnSmDangerText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {canEdit && !showForm && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>＋ Add Expense</Text>
        </TouchableOpacity>
      )}

      {canEdit && showForm && (
        <View style={[styles.card, styles.formCard]}>
          <Text style={styles.cardTitle}>New Expense</Text>

          <Text style={styles.label}>Date</Text>
          <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" />
          {rule && rule.backdateDays !== null ? (
            <Text style={styles.ruleHint}>
              {rule.backdateDays === 0
                ? 'Only today’s expenses can be added.'
                : `Dates allowed from ${minusDays(rule.today, rule.backdateDays)} to ${rule.today}.`}
            </Text>
          ) : null}

          <Text style={styles.label}>Sales Person *</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.salesPersonId} onValueChange={(v) => set('salesPersonId', v)} style={styles.picker}>
              <Picker.Item label="Select…" value="" />
              {salesPersons.map((s) => (
                <Picker.Item key={s.id} label={s.name} value={s.id} />
              ))}
            </Picker>
          </View>
          {salesPersons.length === 0 ? (
            <Text style={styles.hint}>Add sales persons first (Parties screen) to record expenses against them.</Text>
          ) : null}

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.input} value={form.amount} onChangeText={(v) => set('amount', v)} keyboardType="numeric" />

          <Text style={styles.label}>Expense For *</Text>
          <TextInput
            style={styles.input}
            value={form.expenseFor}
            onChangeText={(v) => set('expenseFor', v)}
            placeholder="e.g. Fuel, hotel, client lunch…"
          />

          <Text style={styles.label}>Trip</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.tripId} onValueChange={(v) => set('tripId', String(v))} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {trips.filter((t) => !t.closedAt).map((t) => (
                <Picker.Item key={t.id} label={t.name} value={t.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Attachment (invoice)</Text>
          <TouchableOpacity style={styles.attachBtn} onPress={() => chooseAttachment('add')}>
            <Text style={styles.attachBtnText}>{attachment ? `📎 ${attachment.name}` : '📎 Attach photo or PDF'}</Text>
          </TouchableOpacity>
          {attachment ? (
            <TouchableOpacity onPress={() => setAttachment(null)}>
              <Text style={styles.removeAttach}>Remove attachment</Text>
            </TouchableOpacity>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={onAdd} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Add Expense'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={resetForm}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!showForm && error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Per-sales-person totals */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Expense Ledger by Sales Person</Text>
        {perSalesPerson.map((g) => (
          <View key={g.id} style={styles.spRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.spName}>{g.name}</Text>
              <Text style={styles.spMeta}>
                {g.count} {g.count === 1 ? 'entry' : 'entries'}
              </Text>
            </View>
            <Text style={styles.spTotal}>{inr(g.total)}</Text>
            <TouchableOpacity style={styles.btnSm} onPress={() => openLedger(g.id)}>
              <Text style={styles.btnSmText}>Ledger</Text>
            </TouchableOpacity>
          </View>
        ))}
        {perSalesPerson.length === 0 ? <Text style={styles.empty}>No expenses recorded yet.</Text> : null}
        {perSalesPerson.length > 0 && (
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand Total ({rows.length})</Text>
            <Text style={styles.grandVal}>{inr(grandTotal)}</Text>
          </View>
        )}
      </View>

      {/* Dedicated ledger for the selected sales person */}
      {ledgerSpId && (
        <View style={[styles.card, styles.formCard]}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Ledger — {spName(ledgerSpId)}</Text>
            <TouchableOpacity onPress={() => setLedgerSpId(null)}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.ledgerTotal}>Total: {inr(ledgerTotal)}</Text>

          {(() => {
            let running = 0;
            return orderedLedger.map((r) => {
              running += r.amount;
              return (
                <View key={r.id} style={styles.ledgerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerFor}>{r.expenseFor}</Text>
                    <Text style={styles.ledgerMeta}>
                      {fmtDate(r.date)} · Running {inr(running)}
                    </Text>
                    {r.tripName ? <Text style={styles.tripTag}>🧭 {r.tripName}</Text> : null}
                    <Text style={[styles.paidTag, r.paid ? styles.paidYes : styles.paidNo]}>
                      {r.paid
                        ? `✅ Paid${r.paidMode ? ` · ${r.paidMode}` : ''}${r.paidBy ? ` · by ${r.paidBy}` : ''}`
                        : '● Unpaid'}
                    </Text>
                  </View>
                  <Text style={styles.ledgerAmt}>{inr(r.amount)}</Text>
                  {canEdit && (
                    <TouchableOpacity style={styles.btnSm} onPress={() => onTogglePaid(r)}>
                      <Text style={styles.btnSmText}>{r.paid ? 'Unpay' : 'Pay'}</Text>
                    </TouchableOpacity>
                  )}
                  {canEditExpense && (
                    <TouchableOpacity style={styles.btnSm} onPress={() => openEdit(r)}>
                      <Text style={styles.btnSmText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {r.attachment ? (
                    <TouchableOpacity style={styles.btnSm} onPress={() => openAttachment(r)}>
                      <Text style={styles.btnSmText}>📎</Text>
                    </TouchableOpacity>
                  ) : null}
                  {canDelete && (
                    <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(r.id)}>
                      <Text style={styles.btnSmDangerText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            });
          })()}
          {ledgerRows.length === 0 ? <Text style={styles.empty}>No expenses for this sales person yet.</Text> : null}

          {ledgerRows.length > 0 && (
            <>
              <View style={styles.closingRow}>
                <Text style={styles.grandLabel}>Closing Total</Text>
                <Text style={styles.grandVal}>{inr(ledgerTotal)}</Text>
              </View>
              <View style={styles.closingRow}>
                <Text style={styles.grandLabel}>Still to pay (unpaid)</Text>
                <Text style={[styles.grandVal, { color: '#b45309' }]}>
                  {inr(ledgerRows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0))}
                </Text>
              </View>
            </>
          )}

          <View style={styles.row}>
            {can('send_whatsapp') && (
              <TouchableOpacity style={[styles.btnWa, styles.col]} onPress={onShareLedger}>
                <Text style={styles.btnText}>WhatsApp</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btn, styles.col]} onPress={onExportLedgerPdf}>
              <Text style={styles.btnText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* All expenses + filter */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>All Expenses</Text>
        <Text style={styles.label}>Filter by Sales Person</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={filterSp} onValueChange={(v) => setFilterSp(v)} style={styles.picker}>
            <Picker.Item label="All Sales Persons" value="" />
            {salesPersons.map((s) => (
              <Picker.Item key={s.id} label={s.name} value={s.id} />
            ))}
          </Picker>
        </View>

        {rows.map((r) => (
          <View key={r.id} style={styles.ledgerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ledgerFor}>{r.expenseFor}</Text>
              <Text style={styles.ledgerMeta}>
                {fmtDate(r.date)} · {spName(r.salesPersonId)}
              </Text>
              {r.tripName ? <Text style={styles.tripTag}>🧭 {r.tripName}</Text> : null}
            </View>
            <Text style={styles.ledgerAmt}>{inr(r.amount)}</Text>
            {canEditExpense && (
              <TouchableOpacity style={styles.btnSm} onPress={() => openEdit(r)}>
                <Text style={styles.btnSmText}>Edit</Text>
              </TouchableOpacity>
            )}
            {r.attachment ? (
              <TouchableOpacity style={styles.btnSm} onPress={() => openAttachment(r)}>
                <Text style={styles.btnSmText}>📎</Text>
              </TouchableOpacity>
            ) : null}
            {canDelete && (
              <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(r.id)}>
                <Text style={styles.btnSmDangerText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {rows.length === 0 ? <Text style={styles.empty}>No expenses for this selection.</Text> : null}
      </View>

      {/* Full-screen image attachment preview */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBar}>
            <Text style={styles.modalName} numberOfLines={1}>
              {preview?.name}
            </Text>
            <TouchableOpacity onPress={saveImagePreview}>
              <Text style={styles.modalSave}>⬇ Save / Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPreview(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {preview ? <Image source={{ uri: preview.uri }} style={styles.modalImg} resizeMode="contain" /> : null}
        </View>
      </Modal>

      {/* Edit-expense dialog */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.payBackdrop}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
            <View style={styles.payCard}>
              <Text style={styles.payTitle}>Edit expense</Text>

              <Text style={styles.label}>Date</Text>
              <TextInput style={styles.input} value={ed.date} onChangeText={(v) => setEd({ ...ed, date: v })} placeholder="YYYY-MM-DD" />

              <Text style={styles.label}>Sales Person</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={ed.salesPersonId} onValueChange={(v) => setEd({ ...ed, salesPersonId: String(v) })} style={styles.picker}>
                  <Picker.Item label="Select…" value="" />
                  {salesPersons.map((s) => (
                    <Picker.Item key={s.id} label={s.name} value={s.id} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput style={styles.input} value={ed.amount} onChangeText={(v) => setEd({ ...ed, amount: v })} keyboardType="numeric" />

              <Text style={styles.label}>Expense For</Text>
              <TextInput style={styles.input} value={ed.expenseFor} onChangeText={(v) => setEd({ ...ed, expenseFor: v })} />

              <Text style={styles.label}>Trip</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={ed.tripId} onValueChange={(v) => setEd({ ...ed, tripId: String(v) })} style={styles.picker}>
                  <Picker.Item label="— none —" value="" />
                  {trips.map((t) => (
                    <Picker.Item key={t.id} label={t.closedAt ? `${t.name} (closed)` : t.name} value={t.id} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Attachment (invoice)</Text>
              <TouchableOpacity style={styles.attachBtn} onPress={() => chooseAttachment('edit')}>
                <Text style={styles.attachBtnText}>
                  {edAttachment ? `📎 ${edAttachment.name} (new)` : editTarget?.attachmentName ? `📎 ${editTarget.attachmentName} — tap to replace` : '📎 Attach photo or PDF'}
                </Text>
              </TouchableOpacity>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.payRow}>
                <TouchableOpacity style={[styles.btn, { flex: 1, marginTop: 0 }, savingEdit && styles.btnDisabled]} onPress={confirmEdit} disabled={savingEdit}>
                  <Text style={styles.btnText}>{savingEdit ? 'Saving…' : 'Save changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnGhost, { flex: 1, marginTop: 0 }]} onPress={() => setEditTarget(null)}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Mark-as-paid dialog: payment mode + who paid */}
      <Modal visible={!!payTarget} transparent animationType="fade" onRequestClose={() => setPayTarget(null)}>
        <View style={styles.payBackdrop}>
          <View style={styles.payCard}>
            <Text style={styles.payTitle}>Mark as paid</Text>
            <Text style={styles.paySub}>{payTarget?.expenseFor} — {payTarget ? inr(payTarget.amount) : ''}</Text>

            <Text style={styles.label}>Payment mode</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={payMode} onValueChange={(v) => setPayMode(String(v))} style={styles.picker}>
                {PAYMENT_MODES.map((m) => (
                  <Picker.Item key={m} label={m} value={m} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Paid by</Text>
            <TextInput style={styles.input} value={payBy} onChangeText={setPayBy} placeholder="Who paid it" placeholderTextColor="#94a3b8" />

            <View style={styles.payRow}>
              <TouchableOpacity style={[styles.btn, { flex: 1, marginTop: 0 }]} onPress={confirmPay}>
                <Text style={styles.btnText}>Confirm paid</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnGhost, { flex: 1, marginTop: 0 }]} onPress={() => setPayTarget(null)}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Trip ledger */}
      <Modal visible={!!tripLedger} transparent animationType="slide" onRequestClose={() => setTripLedger(null)}>
        <View style={styles.payBackdrop}>
          <View style={[styles.payCard, { maxHeight: '85%' }]}>
            <View style={styles.cardHead}>
              <Text style={styles.payTitle}>Trip Ledger — {tripLedger?.name}</Text>
              <TouchableOpacity onPress={() => setTripLedger(null)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={tripLedger?.closedAt ? styles.tripClosed : styles.tripOpen}>
              {tripLedger?.closedAt ? '✓ Paid / closed' : '● Open'}
            </Text>
            <Text style={styles.ledgerTotal}>Total: {inr(tripLedgerRows.reduce((s, r) => s + r.amount, 0))}</Text>
            <ScrollView style={{ marginTop: 6 }}>
              {tripLedgerRows.map((r) => (
                <View key={r.id} style={styles.ledgerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerFor}>{r.expenseFor}</Text>
                    <Text style={styles.ledgerMeta}>{fmtDate(r.date)} · {spName(r.salesPersonId)}</Text>
                    <Text style={[styles.paidTag, r.paid ? styles.paidYes : styles.paidNo]}>{r.paid ? '✅ Paid' : '● Unpaid'}</Text>
                  </View>
                  <Text style={styles.ledgerAmt}>{inr(r.amount)}</Text>
                </View>
              ))}
              {tripLedgerRows.length === 0 ? <Text style={styles.empty}>No expenses tagged to this trip.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  formCard: { borderWidth: 1, borderColor: '#0d9488' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  closeX: { fontSize: 16, color: '#94a3b8', paddingHorizontal: 4 },

  label: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  hint: { color: '#94a3b8', fontSize: 10, marginTop: 3 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  attachBtn: { borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center' },
  attachBtnText: { color: '#475569', fontSize: 12.5, fontWeight: '600' },
  removeAttach: { color: '#dc2626', fontSize: 11, marginTop: 6 },

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnWa: { backgroundColor: '#25d366', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  spRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  spName: { fontWeight: '700', fontSize: 13.5, color: '#0b1220' },
  spMeta: { color: '#94a3b8', fontSize: 11 },
  spTotal: { fontWeight: '700', fontSize: 13.5, color: '#ef4444' },

  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 10 },
  closingRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 10 },
  grandLabel: { fontWeight: '700', color: '#0b1220', fontSize: 13 },
  grandVal: { fontWeight: '800', color: '#ef4444', fontSize: 14 },

  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  ledgerFor: { fontWeight: '600', fontSize: 13, color: '#0b1220' },
  ledgerMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  tripTag: { color: '#0f766e', fontSize: 11, fontWeight: '700', marginTop: 2 },
  tripChip: { backgroundColor: '#f1f5f9', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  tripChipText: { color: '#0b1220', fontSize: 12, fontWeight: '600' },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tripName: { fontWeight: '700', fontSize: 13, color: '#0b1220' },
  tripOpen: { color: '#b45309', fontSize: 11, fontWeight: '700', marginTop: 2 },
  tripClosed: { color: '#15803d', fontSize: 11, fontWeight: '700', marginTop: 2 },
  ledgerAmt: { fontWeight: '700', fontSize: 13, color: '#0b1220' },
  paidTag: { fontSize: 10.5, fontWeight: '700', marginTop: 3 },
  paidYes: { color: '#15803d' },
  paidNo: { color: '#b45309' },
  ruleHint: { color: '#b45309', fontSize: 11, marginTop: 4 },
  payBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  payCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  payTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  paySub: { color: '#64748b', fontSize: 12.5, marginTop: 2, marginBottom: 4 },
  payRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  ruleCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  ruleTitle: { fontWeight: '700', fontSize: 14, color: '#0b1220' },
  ruleDesc: { color: '#64748b', fontSize: 11.5, marginTop: 4 },
  ruleRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  ruleInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, width: 90, color: '#0b1220' },
  ruleBtn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  ruleMsg: { color: '#0f766e', fontSize: 12, marginTop: 8 },
  ledgerTotal: { color: '#ef4444', fontWeight: '700', fontSize: 12.5, marginTop: 2 },

  btnSm: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  btnSmText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 16, marginBottom: 6, fontSize: 12.5 },

  modalBg: { flex: 1, backgroundColor: '#111' },
  modalBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#222', padding: 12 },
  modalName: { color: '#fff', flex: 1, fontSize: 12 },
  modalSave: { color: '#25d366', fontWeight: '700', fontSize: 12 },
  modalClose: { color: '#fff', fontSize: 16 },
  modalImg: { flex: 1, width: '100%' },
});
