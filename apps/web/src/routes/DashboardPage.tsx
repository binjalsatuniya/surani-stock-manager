import { useEffect, useState, type ReactNode } from 'react';
import {
  buildWhatsappLink,
  type DashboardKpis,
  type DeliveryType,
  type Inward,
  type Item,
  type Outward,
  type Party,
  type StockLevel,
} from '@surani/shared';
import { api } from '../lib/apiClient';
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
};

export function DashboardPage() {
  const can = usePermission();
  const { user, updateUser } = useAuth();
  const { fill } = useWhatsappTemplates();
  const { selectedFy } = useFinancialYear();
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
  const [recent, setRecent] = useState<RecentRow[]>([]);

  // New Order form
  const [order, setOrder] = useState({ ...EMPTY_ORDER });
  const [orderError, setOrderError] = useState('');

  function loadKpisAndMasters() {
    api.dashboard.kpis().then(setKpis);
    api.parties.list().then(setParties);
    api.parties.list('debtor').then(setDebtors);
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
  function onOrderItemChange(id: string) {
    const it = items.find((i) => i.id === id);
    setOrder((o) => ({
      ...o,
      itemId: id,
      rate: o.rate || (it ? String(it.rate) : ''),
      // GST is fixed to the selected item's slab (set in Item Master) — not editable per order.
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
    if (!order.partyId || !order.itemId || !order.qty || !order.rate) return;
    if (required('outward.note') && !order.note.trim()) return setOrderError('Note is required.');

    const party = selectedParty;
    const item = items.find((i) => i.id === order.itemId);

    // Build the WhatsApp order-slip message NOW (from the current form values).
    const payStatus = party && party.creditDays > 0 ? `Credit (${party.creditDays} days)` : 'Pending';
    const message = fill('orderSlip', {
      partyName: party?.name || '',
      itemName: item?.name || '',
      qty: order.qty,
      unit: item?.unit || '',
      rate: Number(order.rate).toFixed(2),
      amount: oTotal.toFixed(2),
      date: fmtDate(order.date),
      invNo: 'N/A',
      payStatus,
      dueDate: 'N/A',
    });

    // Open the WhatsApp tab synchronously (inside the click) so the browser never blocks it;
    // we point it at the real wa.me link once the order is saved.
    const waWin = window.open('', '_blank');

    try {
      await api.orders.place({
        date: order.date,
        partyId: order.partyId,
        itemId: order.itemId,
        qty: Number(order.qty),
        rate: Number(order.rate),
        gstPct: Number(order.gstPct) || 0,
        deliveryType: order.deliveryType,
        note: order.note.trim() || null,
      });

      // Redirect that tab straight to WhatsApp (with the party's number if saved, otherwise
      // WhatsApp's own contact picker) so you can share the order slip immediately.
      if (message) {
        const waLink = buildWhatsappLink(party?.phone, message);
        if (waWin) waWin.location.href = waLink;
        else window.open(waLink, '_blank');
        // Also open an email draft if the party has an email on file.
        if (party?.email) {
          const subject = `Order Confirmation — ${item?.name || 'Order'}`;
          window.open(
            `mailto:${encodeURIComponent(party.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
            '_blank'
          );
        }
      } else if (waWin) {
        waWin.close();
      }

      setOrder((o) => ({ ...EMPTY_ORDER, date: o.date }));
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
    if (message) window.open(buildWhatsappLink(null, message), '_blank');
  }

  // ----- drag-to-reorder plumbing (CSS `order` keeps the JSX in place) -----
  const TILE_KEYS = ['items', 'receivable', 'payable', 'net', 'lowStock', 'pendingOrders'];
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" {...tileProps('items')}>
            <div className="muted">Items</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{kpis.totalItems}</div>
            <div className="muted" style={{ fontSize: 11 }}>{parties.length} parties</div>
          </div>
          <div className="card" {...tileProps('receivable')}>
            <div className="muted">Total receivable</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#10b981' }}>{inr(kpis.receivable)}</div>
            <div className="muted" style={{ fontSize: 11 }}>to collect</div>
          </div>
          <div className="card" {...tileProps('payable')}>
            <div className="muted">Total payable</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#ef4444' }}>{inr(kpis.payable)}</div>
            <div className="muted" style={{ fontSize: 11 }}>to pay</div>
          </div>
          <div className="card" {...tileProps('net')}>
            <div className="muted">Net position</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpis.netPosition >= 0 ? '#10b981' : '#ef4444' }}>
              {inr(kpis.netPosition)}
            </div>
          </div>
          <div className="card" {...tileProps('lowStock')}>
            <div className="muted">Low stock items</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpis.lowStockCount ? '#ef4444' : undefined }}>{kpis.lowStockCount}</div>
            <div className="muted" style={{ fontSize: 11 }}>at / below reorder</div>
          </div>
          <div className="card" {...tileProps('pendingOrders')}>
            <div className="muted">Pending orders</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{kpis.pendingOrders}</div>
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
            <div className="field" style={{ margin: 0 }}>
              <label>Party (debtor)</label>
              <SearchSelect
                value={order.partyId}
                onChange={(id) => setOrd('partyId', id)}
                options={debtors.map((p) => ({ id: p.id, label: p.name }))}
                placeholder="Type party name…"
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Item</label>
              <select value={order.itemId} onChange={(e) => onOrderItemChange(e.target.value)}>
                <option value="">Select…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              {order.itemId && (() => {
                const it = items.find((i) => i.id === order.itemId);
                const avail = stock[order.itemId] ?? 0;
                const low = it && it.reorder > 0 && avail <= it.reorder;
                const short = oQty > 0 && oQty > avail;
                return (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'inline-block',
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: short ? '#fef2f2' : low ? '#fff7ed' : '#f0fdf4',
                      color: short ? '#dc2626' : low ? '#c2410c' : '#15803d',
                      border: `1px solid ${short ? '#fecaca' : low ? '#fed7aa' : '#bbf7d0'}`,
                    }}
                  >
                    Live stock: {avail} {it?.unit || ''}
                    {short ? ' · not enough!' : low ? ' · low' : ''}
                  </div>
                );
              })()}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Quantity</label>
              <input value={order.qty} onChange={(e) => setOrd('qty', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Selling rate (₹)</label>
              <input value={order.rate} onChange={(e) => setOrd('rate', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>GST %</label>
              {(() => {
                const it = items.find((i) => i.id === order.itemId);
                const locked = !!it;
                return (
                  <select
                    value={order.gstPct}
                    onChange={(e) => setOrd('gstPct', e.target.value)}
                    disabled={locked}
                    title={locked ? "Set automatically from the item's GST slab" : ''}
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                );
              })()}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Delivery</label>
              <select value={order.deliveryType} onChange={(e) => setOrd('deliveryType', e.target.value as DeliveryType)}>
                <option value="ExWorks">Ex Works</option>
                <option value="FOR">FOR (we deliver)</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
              <FieldLabel required={required('outward.note')}>Note</FieldLabel>
              <input value={order.note} onChange={(e) => setOrd('note', e.target.value)} placeholder="Order remarks…" />
            </div>
          </div>
          {oQty > 0 && oRate > 0 && (
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
                <span style={{ color: '#475569' }}>Goods value ({oQty} × ₹{oRate})</span>
                <span>{inr(oGoods)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#475569' }}>GST ({oGst}%)</span>
                <span>{inr((oGoods * oGst) / 100)}</span>
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
