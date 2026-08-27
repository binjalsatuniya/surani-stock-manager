import { fmtMoney, fmtAmount } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { buildWhatsappLink, deliveryTermsLabel, type DashboardKpis, type DeliveryType, type Inward, type Item, type Outward, type Party, type SalesPerson, type StockLevel } from '@surani/shared';
import { api } from '../lib/apiClient';
import { SearchSelect } from '../components/SearchSelect';
import { usePermission } from '../hooks/usePermission';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import { useAuth } from '../context/AuthContext';
import { DraggableRows } from '../components/DraggableRows';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n: number) => fmtMoney(n);

// Order keyed defs by a saved key list; unknown/new keys fall in at the end in default order.
function applyOrderKeys<T extends { key: string }>(defs: T[], saved?: string[]): T[] {
  if (!saved?.length) return defs;
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const k of saved) {
    const d = byKey.get(k);
    if (d && !seen.has(k)) (out.push(d), seen.add(k));
  }
  for (const d of defs) if (!seen.has(d.key)) out.push(d);
  return out;
}

interface RecentRow {
  id: string;
  kind: 'Inward' | 'Outward';
  date: string;
  partyId: string;
  itemId: string;
  qty: number;
  amount: number;
}

const EMPTY_ORDER = {
  date: new Date().toISOString().slice(0, 10),
  partyId: '',
  itemId: '',
  qty: '',
  rate: '',
  gstPct: '18',
  deliveryType: 'ExWorks' as DeliveryType,
  note: '',
  deliveryDate: new Date().toISOString().slice(0, 10),
  creditDays: '0', // pre-filled from the party when picked, editable per order
};

function Kpi({ label, value, color, hint }: { label: string; value: string | number; color?: string; hint?: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

export function DashboardScreen() {
  const can = usePermission();
  const { fill } = useWhatsappTemplates();
  const { user, updateUser } = useAuth();
  const [arranging, setArranging] = useState(false);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [parties, setParties] = useState<Party[]>([]);
  const [debtors, setDebtors] = useState<Party[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [orderSp, setOrderSp] = useState('');
  const [recent, setRecent] = useState<RecentRow[]>([]);

  const [order, setOrder] = useState({ ...EMPTY_ORDER });
  const [orderError, setOrderError] = useState('');
  const [orderMsg, setOrderMsg] = useState('');
  const [saving, setSaving] = useState(false);

  function loadKpisAndMasters() {
    api.dashboard.kpis().then(setKpis).catch(() => {});
    api.parties.list().then(setParties).catch(() => {});
    api.parties.list('debtor').then(setDebtors).catch(() => {});
    api.salesPersons.list().then(setSalesPersons).catch(() => {});
    Promise.all([api.items.list(), api.items.stock()])
      .then(([its, levels]) => {
        setItems(its);
        setStock(Object.fromEntries(levels.map((l: StockLevel) => [l.itemId, l.qty])));
      })
      .catch(() => {});
  }

  function loadRecent() {
    Promise.all([api.inward.list(), api.outward.list()])
      .then(([inward, outward]: [Inward[], Outward[]]) => {
        const rows: RecentRow[] = [
          ...inward.map((m) => ({ id: 'i' + m.id, kind: 'Inward' as const, date: m.date, partyId: m.partyId, itemId: m.itemId, qty: m.qty, amount: m.amount })),
          ...outward.map((m) => ({ id: 'o' + m.id, kind: 'Outward' as const, date: m.date, partyId: m.partyId, itemId: m.itemId, qty: m.qty, amount: m.amount })),
        ];
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setRecent(rows.slice(0, 8));
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadKpisAndMasters();
    loadRecent();
  }, []);

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  function onOrderItemChange(id: string) {
    const it = items.find((i) => i.id === id);
    setOrder((o) => ({
      ...o,
      itemId: id,
      rate: o.rate || (it ? String(it.rate) : ''),
      gstPct: it ? String(it.gstPct ?? 0) : o.gstPct,
    }));
  }

  const selectedParty = debtors.find((p) => p.id === order.partyId);
  const oQty = Number(order.qty) || 0;
  const oRate = Number(order.rate) || 0;
  const oGst = Number(order.gstPct) || 0;
  const oGoods = oQty * oRate;
  const oTotal = oGoods + (oGoods * oGst) / 100;

  async function onPlaceOrder() {
    setOrderError('');
    setOrderMsg('');
    if (!order.partyId || !order.itemId || !order.qty || !order.rate) {
      setOrderError('Party, item, quantity and rate are required.');
      return;
    }
    const party = selectedParty;
    const item = items.find((i) => i.id === order.itemId);
    const creditDays = Math.max(0, Math.floor(Number(order.creditDays) || 0));

    // Build the WhatsApp order-slip message now, from the current form values, exactly like the web
    // "New Order" card does — so placing an order can hand you a confirmation to send straightaway.
    const payStatus = creditDays > 0 ? `Credit (${creditDays} days)` : 'Pending';
    const message = fill('orderSlip', {
      partyName: party?.name || '',
      itemName: item?.name || '',
      qty: order.qty,
      unit: item?.unit || '',
      rate: fmtAmount(order.rate),
      amount: fmtAmount(oTotal),
      date: fmtDate(order.date),
      invNo: 'N/A',
      deliveryTerms: deliveryTermsLabel(order.deliveryType),
      deliveryDate: order.deliveryDate ? fmtDate(order.deliveryDate) : 'N/A',
      payStatus,
      dueDays: creditDays > 0 ? `${creditDays} days` : '100% against delivery',
      dueDate: 'N/A',
    });

    setSaving(true);
    try {
      await api.orders.place({
        date: order.date,
        partyId: order.partyId,
        itemId: order.itemId,
        qty: Number(order.qty),
        rate: Number(order.rate),
        gstPct: Number(order.gstPct) || 0,
        deliveryType: order.deliveryType,
        creditDays,
        note: order.note.trim() || null,
        deliveryDate: order.deliveryDate || null,
      });
      setOrder((o) => ({ ...EMPTY_ORDER, date: o.date }));
      setOrderMsg(`✓ Order saved for ${party?.name || 'party'} · ${inr(oTotal)}. It now shows in Order Book.`);
      loadRecent();
      loadKpisAndMasters();
      // Open WhatsApp with the order slip (the party's chat if a number is saved, otherwise the
      // contact picker). If the party has an email on file, also open a pre-filled email draft.
      if (message) {
        Linking.openURL(buildWhatsappLink(party?.phone, message)).catch(() => {});
        if (party?.email) {
          const subject = `Order Confirmation — ${item?.name || 'Order'}`;
          Linking.openURL(
            `mailto:${encodeURIComponent(party.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
          ).catch(() => {});
        }
      }
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : 'Failed to place order');
    } finally {
      setSaving(false);
    }
  }

  if (!kpis) return null;

  const avail = order.itemId ? stock[order.itemId] ?? 0 : 0;
  const short = oQty > 0 && oQty > avail;

  // --- drag-to-reorder (saved to the account so it follows the user across devices) ---
  const md = user?.preferences?.mobileDashboard;
  function saveDash(next: { tiles?: string[]; sections?: string[] }) {
    if (!user) return;
    const mobileDashboard = { tiles: next.tiles ?? md?.tiles, sections: next.sections ?? md?.sections };
    api.users.setPreferences(user.id, { mobileDashboard }).then(updateUser).catch(() => {});
  }

  const TILE_DEFS = [
    { key: 'items', label: 'Total items', node: <Kpi key="items" label="Total items" value={kpis.totalItems} hint={`${parties.length} parties`} /> },
    { key: 'receivable', label: 'Total receivable', node: <Kpi key="receivable" label="Total receivable" value={inr(kpis.receivable)} color="#10b981" hint="to collect" /> },
    { key: 'payable', label: 'Total payable', node: <Kpi key="payable" label="Total payable" value={inr(kpis.payable)} color="#ef4444" hint="to pay" /> },
    { key: 'net', label: 'Net position', node: <Kpi key="net" label="Net position" value={inr(kpis.netPosition)} color={kpis.netPosition >= 0 ? '#10b981' : '#ef4444'} /> },
    { key: 'lowStock', label: 'Low stock items', node: <Kpi key="lowStock" label="Low stock items" value={kpis.lowStockCount} color={kpis.lowStockCount ? '#ef4444' : undefined} hint="at / below reorder" /> },
    { key: 'pendingOrders', label: 'Pending orders', node: <Kpi key="pendingOrders" label="Pending orders" value={kpis.pendingOrders} /> },
  ];
  const orderedTiles = applyOrderKeys(TILE_DEFS, md?.tiles);

  const kpisNode = (
    <View key="kpis" style={styles.grid}>
      {orderedTiles.map((t) => t.node)}
    </View>
  );

  const newOrderNode = can('place_order') ? (
        <View key="newOrder" style={[styles.card, styles.orderCard]}>
          <Text style={styles.orderTitle}>＋ New Order</Text>
          <Text style={styles.muted}>Records an outward sale</Text>

          <Text style={styles.label}>Sales Person</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={orderSp}
              onValueChange={(v) => {
                setOrderSp(v);
                if (v && order.partyId) {
                  const p = debtors.find((d) => d.id === order.partyId);
                  if (!p || p.salesPersonId !== v) setOrder((o) => ({ ...o, partyId: '' }));
                }
              }}
              style={styles.picker}
            >
              <Picker.Item label="All sales persons" value="" />
              {salesPersons.map((s) => (
                <Picker.Item key={s.id} label={s.name} value={s.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Party (debtor)</Text>
          <SearchSelect
            value={order.partyId}
            onChange={(v) => {
              // Pre-fill Credit Days from the chosen party's default; still editable per order.
              const p = debtors.find((d) => d.id === v);
              setOrder((o) => ({ ...o, partyId: v, creditDays: p ? String(p.creditDays ?? 0) : o.creditDays }));
            }}
            options={(orderSp ? debtors.filter((p) => p.salesPersonId === orderSp) : debtors).map((p) => ({ id: p.id, label: p.name }))}
            placeholder={orderSp ? 'Party for this sales person…' : 'Select party…'}
          />

          <Text style={styles.label}>Credit Days</Text>
          <TextInput
            style={styles.input}
            value={order.creditDays}
            onChangeText={(v) => setOrder((o) => ({ ...o, creditDays: v }))}
            keyboardType="numeric"
            placeholder="e.g. 30 (0 = 100% against delivery)"
          />

          <Text style={styles.label}>Item</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={order.itemId} onValueChange={onOrderItemChange} style={styles.picker}>
              <Picker.Item label="Select item…" value="" />
              {items.map((i) => (
                <Picker.Item key={i.id} label={i.name} value={i.id} />
              ))}
            </Picker>
          </View>
          {order.itemId ? (
            <View style={[styles.badge, short ? styles.badgeBad : styles.badgeGood]}>
              <Text style={[styles.badgeText, short ? styles.badgeTextBad : styles.badgeTextGood]}>
                Live stock: {avail} {items.find((i) => i.id === order.itemId)?.unit || ''}
                {short ? ' · not enough!' : ''}
              </Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput style={styles.input} value={order.qty} onChangeText={(v) => setOrder((o) => ({ ...o, qty: v }))} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Selling rate (₹)</Text>
              <TextInput style={styles.input} value={order.rate} onChangeText={(v) => setOrder((o) => ({ ...o, rate: v }))} keyboardType="numeric" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>GST %</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={order.gstPct} onValueChange={(v) => setOrder((o) => ({ ...o, gstPct: v }))} style={styles.picker} enabled={!items.find((i) => i.id === order.itemId)}>
                  {['0', '5', '12', '18', '28'].map((g) => (
                    <Picker.Item key={g} label={`${g}%`} value={g} />
                  ))}
                </Picker>
              </View>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Delivery</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={order.deliveryType} onValueChange={(v) => setOrder((o) => ({ ...o, deliveryType: v as DeliveryType }))} style={styles.picker}>
                  <Picker.Item label="Ex Works" value="ExWorks" />
                  <Picker.Item label="FOR (we deliver)" value="FOR" />
                </Picker>
              </View>
            </View>
          </View>

          <Text style={styles.label}>Delivery Date</Text>
          <TextInput style={styles.input} value={order.deliveryDate} onChangeText={(v) => setOrder((o) => ({ ...o, deliveryDate: v }))} placeholder="YYYY-MM-DD" />

          <Text style={styles.label}>Note</Text>
          <TextInput style={styles.input} value={order.note} onChangeText={(v) => setOrder((o) => ({ ...o, note: v }))} placeholder="Order remarks…" />

          {oQty > 0 && oRate > 0 ? (
            <View style={styles.breakdown}>
              <Text style={styles.breakdownTitle}>AMOUNT BREAKDOWN</Text>
              <View style={styles.bdRow}>
                <Text style={styles.bdLabel}>Goods value ({oQty} × ₹{fmtAmount(oRate)})</Text>
                <Text style={styles.bdVal}>{inr(oGoods)}</Text>
              </View>
              <View style={styles.bdRow}>
                <Text style={styles.bdLabel}>GST ({oGst}%)</Text>
                <Text style={styles.bdVal}>{inr((oGoods * oGst) / 100)}</Text>
              </View>
              <View style={styles.bdDivider} />
              <View style={styles.bdRow}>
                <Text style={styles.bdTotal}>Total</Text>
                <Text style={[styles.bdTotal, { color: '#10b981' }]}>{inr(oTotal)}</Text>
              </View>
              {selectedParty && selectedParty.creditDays > 0 ? (
                <Text style={styles.muted}>Credit terms: {selectedParty.creditDays} days</Text>
              ) : null}
            </View>
          ) : null}

          {orderError ? <Text style={styles.error}>{orderError}</Text> : null}
          {orderMsg ? <Text style={styles.success}>{orderMsg}</Text> : null}

          <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={onPlaceOrder} disabled={saving}>
            <Text style={styles.btnText}>{saving ? 'Placing…' : '＋ Place order'}</Text>
          </TouchableOpacity>
        </View>
  ) : null;

  const availableStockNode = (
      <View key="availableStock" style={styles.card}>
        <Text style={styles.cardTitle}>Available Stock</Text>
        <Text style={styles.sectionSub}>In-stock materials & live rate</Text>
        <View style={styles.thead}>
          <Text style={[styles.th, { flex: 2 }]}>ITEM</Text>
          <Text style={[styles.th, { textAlign: 'right' }]}>STOCK</Text>
          <Text style={[styles.th, { textAlign: 'right' }]}>RATE ₹</Text>
          <Text style={[styles.th, { textAlign: 'right' }]}>STATUS</Text>
        </View>
        {items
          .filter((it) => (stock[it.id] ?? 0) > 0)
          .map((it) => {
            const qty = stock[it.id] ?? 0;
            const low = it.reorder > 0 && qty <= it.reorder;
            return (
              <View key={it.id} style={styles.tr}>
                <Text style={[styles.td, { flex: 2, fontWeight: '700' }]}>
                  {it.name} <Text style={styles.mutedTd}>({it.unit})</Text>
                </Text>
                <Text style={[styles.td, { textAlign: 'right', fontWeight: '700' }]}>{qty}</Text>
                <Text style={[styles.td, { textAlign: 'right', fontWeight: '700' }]}>{it.rate ? fmtMoney(it.rate) : '—'}</Text>
                <Text style={[styles.td, { textAlign: 'right', color: low ? '#ef4444' : '#10b981', fontWeight: '700' }]}>{low ? 'Low' : 'OK'}</Text>
              </View>
            );
          })}
        {items.filter((it) => (stock[it.id] ?? 0) > 0).length === 0 ? (
          <Text style={styles.muted}>No materials in stock right now.</Text>
        ) : null}
      </View>
  );

  const recentActivityNode = (
      <View key="recentActivity" style={styles.card}>
        <Text style={styles.cardTitle}>Recent Activity</Text>
        {recent.map((m) => (
          <View key={m.id} style={styles.tr}>
            <View style={{ flex: 1 }}>
              <Text style={styles.recentTop}>
                <Text style={{ color: m.kind === 'Inward' ? '#10b981' : '#ef4444', fontWeight: '700' }}>{m.kind}</Text>
                <Text style={styles.mutedTd}> · {fmtDate(m.date)}</Text>
              </Text>
              <Text style={styles.recentSub}>
                {partyName(m.partyId)} · {itemName(m.itemId)} · {m.qty}
              </Text>
            </View>
            <Text style={{ fontWeight: '700', color: '#0b1220' }}>{inr(m.amount)}</Text>
          </View>
        ))}
        {recent.length === 0 ? <Text style={styles.muted}>No transactions yet.</Text> : null}
      </View>
  );

  const SECTION_DEFS = [
    { key: 'kpis', label: 'Summary tiles', node: kpisNode },
    ...(newOrderNode ? [{ key: 'newOrder', label: 'New Order form', node: newOrderNode }] : []),
    { key: 'availableStock', label: 'Available Stock', node: availableStockNode },
    { key: 'recentActivity', label: 'Recent Activity', node: recentActivityNode },
  ];
  const orderedSections = applyOrderKeys(SECTION_DEFS, md?.sections);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.arrangeBar}>
        <TouchableOpacity style={[styles.arrangeBtn, arranging && styles.arrangeBtnOn]} onPress={() => setArranging((a) => !a)}>
          <Text style={[styles.arrangeText, arranging && styles.arrangeTextOn]}>{arranging ? '✓ Done' : '⠿ Arrange'}</Text>
        </TouchableOpacity>
      </View>
      {arranging ? (
        <>
          <Text style={styles.arrHint}>Drag to reorder your tiles and sections. Saved to your account, on every device.</Text>
          <Text style={styles.arrHead}>Summary tiles</Text>
          <DraggableRows items={orderedTiles.map((t) => ({ key: t.key, label: t.label }))} onReorder={(keys) => saveDash({ tiles: keys })} />
          <Text style={styles.arrHead}>Sections</Text>
          <DraggableRows items={orderedSections.map((s) => ({ key: s.key, label: s.label }))} onReorder={(keys) => saveDash({ sections: keys })} />
        </>
      ) : (
        orderedSections.map((s) => s.node)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  arrangeBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  arrangeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  arrangeBtnOn: { backgroundColor: '#0d9488' },
  arrangeText: { fontWeight: '700', fontSize: 13, color: '#475569' },
  arrangeTextOn: { color: '#fff' },
  arrHint: { color: '#94a3b8', fontSize: 12, marginBottom: 12 },
  arrHead: { fontWeight: '700', fontSize: 13, color: '#0b1220', marginTop: 8, marginBottom: 8 },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiLabel: { color: '#94a3b8', fontSize: 12 },
  kpiValue: { fontSize: 20, fontWeight: '700', marginTop: 6, color: '#0b1220' },
  kpiHint: { color: '#94a3b8', fontSize: 10, marginTop: 2 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  orderCard: { borderWidth: 1, borderColor: '#0d9488' },
  orderTitle: { fontSize: 17, fontWeight: '700', color: '#0f766e' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0b1220', marginBottom: 10 },
  sectionSub: { color: '#94a3b8', fontSize: 11.5, marginTop: -6, marginBottom: 10 },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 4 },

  label: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, marginTop: 6 },
  badgeGood: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  badgeBad: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  badgeText: { fontSize: 11.5, fontWeight: '700' },
  badgeTextGood: { color: '#15803d' },
  badgeTextBad: { color: '#dc2626' },

  breakdown: { marginTop: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12 },
  breakdownTitle: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 1, marginBottom: 8 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bdLabel: { color: '#475569', fontSize: 13 },
  bdVal: { fontSize: 13, color: '#0b1220' },
  bdDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },
  bdTotal: { fontWeight: '700', fontSize: 15, color: '#0b1220' },

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  success: { color: '#15803d', fontSize: 12.5, marginTop: 8, fontWeight: '600' },

  thead: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#e2e8f0', paddingBottom: 6 },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.6 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  td: { flex: 1, fontSize: 13, color: '#0b1220' },
  mutedTd: { color: '#94a3b8' },
  recentTop: { fontSize: 13 },
  recentSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
});
