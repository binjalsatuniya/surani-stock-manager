import { useEffect, useState, type ReactNode } from 'react';
import {
  buildWhatsappLink,
  deliveryTermsLabel,
  fyOfDate,
  type DashboardKpis,
  type DeliveryType,
  type Inward,
  type Item,
  type Outward,
  type Party,
  type SalesPerson,
  type StockLevel,
} from '@surani/shared';
import { api } from '../lib/apiClient';
import { shareOnWhatsapp, shareViaWindow } from '../lib/whatsappShare';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';

// Reorder helper: move an item from one index to another (returns a new array).
function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Apply a saved key order to a set of defs; unknown/new keys fall in at the end in default order.
function applyOrder<T extends { key: string }>(defs: T[], savedOrder?: string[]): T[] {
  if (!savedOrder?.length) return defs;
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const k of savedOrder) {
    const d = byKey.get(k);
    if (d && !seen.has(k)) {
      out.push(d);
      seen.add(k);
    }
  }
  for (const d of defs) if (!seen.has(d.key)) out.push(d);
  return out;
}

const dragHandleStyle: React.CSSProperties = {
  cursor: 'grab',
  fontSize: 11.5,
  fontWeight: 700,
  color: '#0f766e',
  background: '#f0fdfa',
  border: '1px dashed #99f6e4',
  borderRadius: 8,
  padding: '4px 10px',
  marginBottom: 8,
  userSelect: 'none',
};
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';
import { SearchSelect } from '../components/SearchSelect';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n: number) => `₹${n.toFixed(2)}`;

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
  deliveryDate: new Date().toISOString().slice(0, 10), // defaults to today, editable
};

export function DashboardPage() {
  const can = usePermission();
  const { user, updateUser } = useAuth();
  const { fill } = useWhatsappTemplates();
  const { selectedFy, setSelectedFy } = useFinancialYear();
  const { required } = useFieldSettings();

  // Drag-to-reorder layout — saved per user (server-side) so it follows them across devices.
  const [arranging, setArranging] = useState(false);
  const [tileOrder, setTileOrder] = useState<string[]>(user?.preferences?.dashboard?.tiles ?? []);
  const [sectionOrder, setSectionOrder] = useState<string[]>(user?.preferences?.dashboard?.sections ?? []);
  const [dragTile, setDragTile] = useState<string | null>(null);
  const [dragSection, setDragSection] = useState<string | null>(null);

  async function saveOrder(next: { tiles?: string[]; sections?: string[] }) {
    if (!user) return;
    const dashboard = { tiles: next.tiles ?? tileOrder, sections: next.sections ?? sectionOrder };
    try {
      const updated = await api.users.setPreferences(user.id, { dashboard });
      updateUser(updated); // keep the cached user in sync so the order sticks on reload
    } catch {
      /* even if the save fails, keep the on-screen order for this session */
    }
  }
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [parties, setParties] = useState<Party[]>([]);
  const [debtors, setDebtors] = useState<Party[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  // New Order: filter the party list to one sales person's parties.
  const [orderSp, setOrderSp] = useState('');
  const [recent, setRecent] = useState<RecentRow[]>([]);

  // New Order form
  const [order, setOrder] = useState({ ...EMPTY_ORDER });
  const [orderError, setOrderError] = useState('');

  function loadKpisAndMasters() {
    api.dashboard.kpis().then(setKpis);
    api.parties.list().then(setParties);
    api.parties.list('debtor').then(setDebtors);
    api.salesPersons.list().then(setSalesPersons);
    Promise.all([api.items.list(), api.items.stock()]).then(([its, levels]) => {
      setItems(its);
      setStock(Object.fromEntries(levels.map((l: StockLevel) => [l.itemId, l.qty])));
    });
  }

  function loadRecent() {
    Promise.all([
      api.inward.list({ fy: selectedFy || undefined }),
      api.outward.list({ fy: selectedFy || undefined }),
    ]).then(([inward, outward]: [Inward[], Outward[]]) => {
      const rows: RecentRow[] = [
        ...inward.map((m) => ({ id: 'i' + m.id, kind: 'Inward' as const, date: m.date, partyId: m.partyId, itemId: m.itemId, qty: m.qty, amount: m.amount })),
        ...outward.map((m) => ({ id: 'o' + m.id, kind: 'Outward' as const, date: m.date, partyId: m.partyId, itemId: m.itemId, qty: m.qty, amount: m.amount })),
      ];
      rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setRecent(rows.slice(0, 8));
    });
  }

  useEffect(() => {
    loadKpisAndMasters();
  }, []);

  useEffect(() => {
    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFy]);

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  function setOrd<K extends keyof typeof order>(key: K, value: string) {
    setOrder((o) => ({ ...o, [key]: value }));
  }
  // One order can cover several items. Party, date, delivery and note are entered once; each line
  // is placed as its own order sharing them, matching how stock and the ledgers read an order.
  type OrderLine = { itemId: string; qty: string; rate: string; gstPct: string };
  const BLANK_ORDER_LINE: OrderLine = { itemId: '', qty: '', rate: '', gstPct: '18' };
  const [orderLines, setOrderLines] = useState<OrderLine[]>([{ ...BLANK_ORDER_LINE }]);

  function setOrderLine(i: number, patch: Partial<OrderLine>) {
    setOrderLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function addOrderLine() {
    setOrderLines((ls) => [...ls, { ...BLANK_ORDER_LINE }]);
  }
  function removeOrderLine(i: number) {
    setOrderLines((ls) => (ls.length === 1 ? ls : ls.filter((_, j) => j !== i)));
  }
  function onOrderLineItemChange(i: number, id: string) {
    const it = items.find((x) => x.id === id);
    setOrderLines((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              itemId: id,
              rate: l.rate || (it ? String(it.rate) : ''),
              // GST is fixed to the item's slab (set in Item Master), as it was for a single item.
              gstPct: it ? String(it.gstPct ?? 0) : l.gstPct,
            }
          : l
      )
    );
  }

  const selectedParty = debtors.find((p) => p.id === order.partyId);
  const orderTotals = orderLines.map((l) => {
    const g = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    return { goods: g, withGst: g + (g * (Number(l.gstPct) || 0)) / 100 };
  });
  const filledOrderLines = orderLines.filter((l) => l.itemId && l.qty && l.rate);
  const oGoods = orderTotals.reduce((s, t) => s + t.goods, 0);
  const oTotal = orderTotals.reduce((s, t) => s + t.withGst, 0);

  async function onPlaceOrder() {
    setOrderError('');
    if (!order.partyId) return setOrderError('Select a party.');
    if (filledOrderLines.length === 0) return setOrderError('Add at least one item, with a quantity and rate.');
    const partial = orderLines.findIndex((l) => (l.itemId || l.qty || l.rate) && !(l.itemId && l.qty && l.rate));
    if (partial >= 0) return setOrderError(`Item ${partial + 1} is incomplete — it needs an item, quantity and rate.`);
    if (required('outward.note') && !order.note.trim()) return setOrderError('Note is required.');

    const party = selectedParty;
    const nameOf = (id: string) => items.find((i) => i.id === id);
    const first = nameOf(filledOrderLines[0].itemId);
    const single = filledOrderLines.length === 1;

    // Build the WhatsApp order-slip message NOW (from the current form values). A single-item
    // order reads exactly as before; several items become an itemised list in place of the name,
    // since the template has one slot for the item and inventing extra ones would break anyone's
    // customised wording.
    const payStatus = party && party.creditDays > 0 ? `Credit (${party.creditDays} days)` : 'Pending';
    const itemised = filledOrderLines
      .map((l) => {
        const it = nameOf(l.itemId);
        return `${it?.name ?? ''} — ${l.qty} ${it?.unit ?? ''} @ ₹${Number(l.rate).toFixed(2)}`;
      })
      .join('\n');
    const message = fill('orderSlip', {
      partyName: party?.name || '',
      itemName: single ? first?.name || '' : `\n${itemised}`,
      qty: single ? filledOrderLines[0].qty : String(filledOrderLines.length),
      unit: single ? first?.unit || '' : 'items',
      rate: single ? Number(filledOrderLines[0].rate).toFixed(2) : 'see above',
      amount: oTotal.toFixed(2),
      date: fmtDate(order.date),
      invNo: 'N/A',
      deliveryTerms: deliveryTermsLabel(order.deliveryType),
      deliveryDate: order.deliveryDate ? fmtDate(order.deliveryDate) : 'N/A',
      payStatus,
      dueDate: 'N/A',
    });

    // Open the WhatsApp tab synchronously (inside the click) so the browser never blocks it;
    // we point it at the real wa.me link once the order is saved.
    const waWin = window.open('', '_blank');

    try {
      // One order per item line, all sharing this order's party, date, delivery and note.
      for (const l of filledOrderLines) {
        await api.orders.place({
          date: order.date,
          partyId: order.partyId,
          itemId: l.itemId,
          qty: Number(l.qty),
          rate: Number(l.rate),
          gstPct: Number(l.gstPct) || 0,
          deliveryType: order.deliveryType,
          note: order.note.trim() || null,
          deliveryDate: order.deliveryDate || null,
        });
      }

      // Redirect that tab straight to WhatsApp (with the party's number if saved, otherwise
      // WhatsApp's own contact picker) so you can share the order slip immediately.
      if (message) {
        await shareViaWindow(waWin, party?.phone, message);
        // Also open an email draft if the party has an email on file.
        if (party?.email) {
          const subject = `Order Confirmation — ${single ? first?.name || 'Order' : `${filledOrderLines.length} items`}`;
          window.open(
            `mailto:${encodeURIComponent(party.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
            '_blank'
          );
        }
      } else if (waWin) {
        waWin.close();
      }

      const efy = fyOfDate(order.date);
      if (efy && efy !== selectedFy) setSelectedFy(efy);
      setOrder((o) => ({ ...EMPTY_ORDER, date: o.date }));
      setOrderLines([{ ...BLANK_ORDER_LINE }]);
      loadRecent();
      loadKpisAndMasters();
    } catch (e) {
      if (waWin) waWin.close();
      setOrderError(e instanceof Error ? e.message : 'Failed to place order');
    }
  }

  function onShare() {
    if (!kpis) return;
    const message = fill('dashboardSummary', {
      date: fmtDate(new Date().toISOString()),
      receivable: kpis.receivable.toFixed(2),
      payable: kpis.payable.toFixed(2),
      netPosition: kpis.netPosition.toFixed(2),
      lowStockCount: String(kpis.lowStockCount),
      pendingOrders: String(kpis.pendingOrders),
    });
    if (message) shareOnWhatsapp(null, message);
  }

  // ----- drag-to-reorder plumbing (CSS `order` keeps the JSX in place) -----
  // Money first — the tiles are positioned by CSS `order` from this list, not by JSX position.
  const TILE_KEYS = ['receivable', 'payable', 'net', 'items', 'lowStock', 'pendingOrders'];
  const SECTION_KEYS = ['kpis', 'newOrder', 'availableStock', 'recentActivity'];
  const orderKeys = (defaults: string[], saved: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of saved) if (defaults.includes(k) && !seen.has(k)) (out.push(k), seen.add(k));
    for (const k of defaults) if (!seen.has(k)) out.push(k);
    return out;
  };
  const effTiles = orderKeys(TILE_KEYS, tileOrder);
  const effSections = orderKeys(SECTION_KEYS, sectionOrder);

  function onTileDrop(target: string) {
    if (dragTile === null) return;
    const from = effTiles.indexOf(dragTile);
    const to = effTiles.indexOf(target);
    setDragTile(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = reorder(effTiles, from, to);
    setTileOrder(next);
    saveOrder({ tiles: next });
  }
  function onSectionDrop(target: string) {
    if (dragSection === null) return;
    const from = effSections.indexOf(dragSection);
    const to = effSections.indexOf(target);
    setDragSection(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = reorder(effSections, from, to);
    setSectionOrder(next);
    saveOrder({ sections: next });
  }

  // Props for a KPI tile: draggable in arrange mode, drop target, positioned via CSS order.
  const tileProps = (key: string): React.HTMLAttributes<HTMLDivElement> => ({
    draggable: arranging,
    onDragStart: () => setDragTile(key),
    onDragEnd: () => setDragTile(null),
    onDragOver: (e) => arranging && dragTile !== null && e.preventDefault(),
    onDrop: (e) => {
      e.stopPropagation();
      onTileDrop(key);
    },
    style: {
      order: effTiles.indexOf(key),
      cursor: arranging ? 'grab' : undefined,
      opacity: arranging && dragTile === key ? 0.5 : 1,
      outline: arranging ? '1px dashed #99f6e4' : undefined,
    },
  });

  // Props for a section wrapper: drop target + CSS order. Dragging is via its handle only.
  const sectionProps = (key: string): React.HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e) => arranging && dragSection !== null && e.preventDefault(),
    onDrop: () => onSectionDrop(key),
    style: { order: effSections.indexOf(key), opacity: arranging && dragSection === key ? 0.5 : 1 },
  });

  // A small draggable handle shown at the top of each section while arranging.
  const SectionHandle = ({ sectionKey }: { sectionKey: string }) =>
    arranging ? (
      <div
        draggable
        onDragStart={() => setDragSection(sectionKey)}
        onDragEnd={() => setDragSection(null)}
        style={dragHandleStyle}
      >
        ⠿ Drag to move this section
      </div>
    ) : null;

  if (!kpis) return <div className="card">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="toolbar" style={{ margin: 0, justifyContent: 'flex-end', order: -2, gap: 8 }}>
        <button className="btn btn-sm" onClick={() => setArranging((a) => !a)} title="Drag tiles and sections to reorder the dashboard">
          {arranging ? '✓ Done arranging' : '⠿ Arrange layout'}
        </button>
        {can('send_whatsapp') && (
          <button className="btn btn-sm btn-primary" onClick={onShare}>
            Share on WhatsApp
          </button>
        )}
      </div>
      {arranging && (
        <div className="muted" style={{ order: -1, fontSize: 12 }}>
          Drag a tile, or a section’s “⠿ Drag to move” handle, to rearrange. Your layout is saved to your account and follows you on every device.
        </div>
      )}

      {/* KPI tiles */}
      <div {...sectionProps('kpis')}>
        <SectionHandle sectionKey="kpis" />
        <div className="kpi-grid">
          <div className="card kpi-major" {...tileProps('receivable')}>
            <div className="muted kpi-label">Total receivable</div>
            <div className="kpi-value" style={{ color: '#10b981' }}>{inr(kpis.receivable)}</div>
            <div className="muted kpi-sub" style={{ fontSize: 11 }}>to collect</div>
          </div>
          <div className="card kpi-major" {...tileProps('payable')}>
            <div className="muted kpi-label">Total payable</div>
            <div className="kpi-value" style={{ color: '#ef4444' }}>{inr(kpis.payable)}</div>
            <div className="muted kpi-sub" style={{ fontSize: 11 }}>to pay</div>
          </div>
          <div className="card kpi-major" {...tileProps('net')}>
            <div className="muted kpi-label">Net position</div>
            <div className="kpi-value" style={{ color: kpis.netPosition >= 0 ? '#10b981' : '#ef4444' }}>
              {inr(kpis.netPosition)}
            </div>
            <div className="muted kpi-sub" style={{ fontSize: 11 }}>receivable − payable</div>
          </div>
          <div className="card kpi-minor" {...tileProps('items')}>
            <div className="muted kpi-label">Items</div>
            <div className="kpi-value">
              {kpis.totalItems}
              <span className="muted" style={{ fontSize: 11, fontWeight: 500 }}> · {parties.length} parties</span>
            </div>
          </div>
          <div className="card kpi-minor" {...tileProps('lowStock')}>
            <div className="muted kpi-label">Low stock</div>
            <div className="kpi-value" style={{ color: kpis.lowStockCount ? '#ef4444' : undefined }}>
              {kpis.lowStockCount}
            </div>
          </div>
          <div className="card kpi-minor" {...tileProps('pendingOrders')}>
            <div className="muted kpi-label">Pending orders</div>
            <div className="kpi-value">{kpis.pendingOrders}</div>
          </div>
        </div>
      </div>

      {/* + New Order (records an outward sale) */}
      {can('place_order') && (
        <div {...sectionProps('newOrder')}>
          <SectionHandle sectionKey="newOrder" />
        <div className="card" style={{ border: '1px solid var(--accent, #0d9488)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--accent-2, #0f766e)' }}>
            ＋ New Order <span className="muted" style={{ fontWeight: 600 }}>(records an outward sale)</span>
          </h3>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>Date</label>
              <input type="date" value={order.date} onChange={(e) => setOrd('date', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 170 }}>
              <label>Sales Person</label>
              <select
                value={orderSp}
                onChange={(e) => {
                  const sp = e.target.value;
                  setOrderSp(sp);
                  // If the chosen party isn't this sales person's, clear it.
                  if (sp && order.partyId) {
                    const p = debtors.find((d) => d.id === order.partyId);
                    if (!p || p.salesPersonId !== sp) setOrd('partyId', '');
                  }
                }}
              >
                <option value="">All sales persons</option>
                {salesPersons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 240 }}>
              <label>Party (debtor)</label>
              <SearchSelect
                value={order.partyId}
                onChange={(id) => setOrd('partyId', id)}
                options={(orderSp ? debtors.filter((p) => p.salesPersonId === orderSp) : debtors).map((p) => ({ id: p.id, label: p.name }))}
                placeholder={orderSp ? 'Type a party for this sales person…' : 'Type party name…'}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Delivery</label>
              <select value={order.deliveryType} onChange={(e) => setOrd('deliveryType', e.target.value as DeliveryType)}>
                <option value="ExWorks">Ex Works</option>
                <option value="FOR">FOR (we deliver)</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0, width: 150 }}>
              <label>Delivery Date</label>
              <input type="date" value={order.deliveryDate} onChange={(e) => setOrd('deliveryDate', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ margin: 0, width: 150 }}>
              <FieldLabel required={required('outward.note')}>Note</FieldLabel>
              <input value={order.note} onChange={(e) => setOrd('note', e.target.value)} placeholder="Remarks…" style={{ width: '100%' }} />
            </div>
          </div>
          {/* One invoice, several items. Each line below is saved as its own entry sharing the
              party, date and invoice number above — which is what stock and the ledgers read. */}
          <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Items</div>
            {orderLines.map((l, i) => {
              const it = items.find((x) => x.id === l.itemId);
              const avail = l.itemId ? stock[l.itemId] ?? 0 : 0;
              const q = Number(l.qty) || 0;
              const short = q > 0 && q > avail;
              const locked = !!it;
              return (
                <div key={i} className="toolbar" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
                  <div className="field" style={{ margin: 0, minWidth: 30 }}>
                    <label>#</label>
                    <div style={{ fontSize: 13, paddingTop: 6 }}>{i + 1}</div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Item</label>
                    <select value={l.itemId} onChange={(e) => onOrderLineItemChange(i, e.target.value)}>
                      <option value="">Select…</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    {l.itemId && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                          display: 'inline-block',
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: short ? '#fef2f2' : '#f0fdf4',
                          color: short ? '#dc2626' : '#15803d',
                          border: `1px solid ${short ? '#fecaca' : '#bbf7d0'}`,
                        }}
                      >
                        Live stock: {avail} {it?.unit || ''}
                        {short ? ' · not enough!' : ''}
                      </div>
                    )}
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Qty</label>
                    <input value={l.qty} onChange={(e) => setOrderLine(i, { qty: e.target.value })} style={{ width: 90 }} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Rate</label>
                    <input value={l.rate} onChange={(e) => setOrderLine(i, { rate: e.target.value })} style={{ width: 90 }} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>GST %</label>
                    <select
                      value={l.gstPct}
                      onChange={(e) => setOrderLine(i, { gstPct: e.target.value })}
                      disabled={locked}
                      title={locked ? "Set automatically from the item's GST slab" : ''}
                    >
                      {['0', '5', '12', '18', '28'].map((g) => (
                        <option key={g} value={g}>{g}%</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Amount</label>
                    <div style={{ fontSize: 13, paddingTop: 6, whiteSpace: 'nowrap' }}>
                      ₹{orderTotals[i].withGst.toFixed(2)}
                    </div>
                  </div>
                  {orderLines.length > 1 && (
                    <button className="btn btn-sm btn-danger" onClick={() => removeOrderLine(i)} title="Remove this item">
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            <button className="btn btn-sm" onClick={addOrderLine}>
              + Add item
            </button>
          </div>
          {filledOrderLines.length > 0 && (
            <div
              style={{
                marginTop: 12,
                maxWidth: 320,
                background: 'var(--surface-2, #f8fafc)',
                border: '1px solid var(--line, #e2e8f0)',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', marginBottom: 10 }}>
                Amount Breakdown
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#475569' }}>
                  Goods value ({filledOrderLines.length} item{filledOrderLines.length === 1 ? '' : 's'})
                </span>
                <span>{inr(oGoods)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#475569' }}>GST</span>
                <span>{inr(oTotal - oGoods)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--line, #e2e8f0)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
                <span>Total</span>
                <span style={{ color: '#10b981' }}>{inr(oTotal)}</span>
              </div>
              {selectedParty && selectedParty.creditDays > 0 && (
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Credit terms: {selectedParty.creditDays} days</div>
              )}
            </div>
          )}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={onPlaceOrder}>
              ＋ Place order
            </button>
          </div>
          {orderError && <div className="login-err show">{orderError}</div>}
        </div>
        </div>
      )}

      {/* Available stock by material */}
      <div {...sectionProps('availableStock')}>
        <SectionHandle sectionKey="availableStock" />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Available Stock <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>— in-stock materials & live rate</span></h3>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th>Live Stock</th>
              <th>Live Rate (₹)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((it) => (stock[it.id] ?? 0) > 0)
              .map((it) => {
                const qty = stock[it.id] ?? 0;
                const low = it.reorder > 0 && qty <= it.reorder;
                return (
                  <tr key={it.id}>
                    <td><strong>{it.name}</strong></td>
                    <td className="muted">{it.unit}</td>
                    <td style={{ fontWeight: 700 }}>{qty}</td>
                    <td>
                      <strong>{it.rate ? `₹${it.rate}` : '—'}</strong>
                      {it.rateDate && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>{fmtDate(it.rateDate)}</span>}
                    </td>
                    <td>
                      <span style={{ color: low ? '#ef4444' : '#10b981', fontWeight: 700 }}>{low ? 'Low' : 'OK'}</span>
                    </td>
                  </tr>
                );
              })}
            {items.filter((it) => (stock[it.id] ?? 0) > 0).length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No materials in stock right now.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Recent activity */}
      <div {...sectionProps('recentActivity')}>
        <SectionHandle sectionKey="recentActivity" />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent Activity</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Party</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((m) => (
              <tr key={m.id}>
                <td>{fmtDate(m.date)}</td>
                <td style={{ color: m.kind === 'Inward' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{m.kind}</td>
                <td>{partyName(m.partyId)}</td>
                <td>{itemName(m.itemId)}</td>
                <td>{m.qty}</td>
                <td>{inr(m.amount)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No transactions yet. Add items &amp; parties, then record inward/outward.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
