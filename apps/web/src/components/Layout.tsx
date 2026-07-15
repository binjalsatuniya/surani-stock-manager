import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import type { PermissionKey } from '@surani/shared';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useFinancialYear } from '../context/FinancialYearContext';
import { SuraniFlame } from './Logo';
import { api } from '../lib/apiClient';

interface NavDef {
  key: string;
  to: string;
  label: string;
  perm?: PermissionKey;
  primaryOnly?: boolean;
}

// The default order. Users can reorder these; their order is saved per-device.
const NAV_DEFS: NavDef[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard' },
  { key: 'inward', to: '/inward', label: 'Inward', perm: 'view_inward' },
  { key: 'outward', to: '/outward', label: 'Outward', perm: 'view_outward' },
  { key: 'orderbook', to: '/orderbook', label: 'Order Book', perm: 'view_orderbook' },
  { key: 'payments', to: '/payments', label: 'Payment Due', perm: 'view_payments' },
  { key: 'expenses', to: '/expenses', label: 'Expenses', perm: 'view_expenses' },
  { key: 'parties', to: '/parties', label: 'Parties', perm: 'view_parties' },
  { key: 'items', to: '/items', label: 'Items', perm: 'view_items' },
  { key: 'livestock', to: '/live-stock', label: 'Live Stock & Rate', perm: 'view_items' },
  { key: 'users', to: '/users', label: 'Users', perm: 'manage_users' },
  { key: 'approvals', to: '/approvals', label: 'Approvals', perm: 'view_approvals' },
  { key: 'audit', to: '/audit-log', label: 'Audit Log', perm: 'view_audit_log' },
  { key: 'backup', to: '/backup', label: 'Backup', perm: 'view_backup' },
  { key: 'whatsapp', to: '/whatsapp-messages', label: 'WhatsApp Messages', perm: 'send_whatsapp' },
  { key: 'fieldrules', to: '/field-rules', label: 'Field Rules', perm: 'manage_users' },
  { key: 'loginlocations', to: '/login-locations', label: 'Login Locations', primaryOnly: true },
];

const ORDER_KEY = 'surani-nav-order';

function loadOrder(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
    if (Array.isArray(saved)) return saved.filter((k) => typeof k === 'string');
  } catch {
    /* ignore */
  }
  return [];
}

export function Layout() {
  const { user, logout } = useAuth();
  const can = usePermission();
  const { fys, selectedFy, setSelectedFy, refreshFys } = useFinancialYear();
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [order, setOrder] = useState<string[]>(() => loadOrder());
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    if (!can('view_approvals')) return;
    api.approvals
      .list('pending')
      .then((rows) => setPendingApprovals(rows.length))
      .catch(() => setPendingApprovals(0));
  }, [can]);

  // Effective order = saved order (known keys) followed by any not-yet-ordered keys, in default order.
  const orderedDefs = useMemo(() => {
    const byKey = new Map(NAV_DEFS.map((d) => [d.key, d]));
    const seen = new Set<string>();
    const result: NavDef[] = [];
    for (const k of order) {
      const d = byKey.get(k);
      if (d && !seen.has(k)) {
        result.push(d);
        seen.add(k);
      }
    }
    for (const d of NAV_DEFS) if (!seen.has(d.key)) result.push(d);
    return result;
  }, [order]);

  // Only the items this user is allowed to see.
  const visible = orderedDefs.filter(
    (d) => (!d.perm || can(d.perm)) && (!d.primaryOnly || user?.isPrimary)
  );

  function persist(next: string[]) {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Move a visible item up/down by swapping with its neighbour in the full ordered list.
  function move(key: string, dir: -1 | 1) {
    const keys = orderedDefs.map((d) => d.key);
    const visibleKeys = visible.map((d) => d.key);
    const vi = visibleKeys.indexOf(key);
    const targetKey = visibleKeys[vi + dir];
    if (targetKey === undefined) return;
    const i = keys.indexOf(key);
    const j = keys.indexOf(targetKey);
    [keys[i], keys[j]] = [keys[j], keys[i]];
    persist(keys);
  }

  function resetOrder() {
    persist(NAV_DEFS.map((d) => d.key));
  }

  async function onAddFy() {
    const label = prompt('Create a Financial Year (format 2025-26):');
    if (!label) return;
    try {
      await api.financialYears.create(label.trim());
      refreshFys();
      setSelectedFy(label.trim());
    } catch {
      alert('Could not create that financial year. Use the format 2025-26.');
    }
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SuraniFlame size={30} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ letterSpacing: '0.12em' }}>SURANI</span>
            <span style={{ fontSize: 9, fontWeight: 500, fontStyle: 'italic', color: 'rgba(255,255,255,.6)' }}>
              A Legacy Driven by Value
            </span>
          </div>
        </div>
        <button
          className="btn btn-sm"
          style={{ margin: '0 0 8px', background: customizing ? '#0d9488' : 'rgba(255,255,255,.12)', color: '#fff' }}
          onClick={() => setCustomizing((c) => !c)}
        >
          {customizing ? 'Done' : '⇅ Customize menu'}
        </button>
        {customizing && (
          <button className="btn btn-sm" style={{ margin: '0 0 8px', background: 'rgba(255,255,255,.12)', color: '#fff' }} onClick={resetOrder}>
            Reset order
          </button>
        )}

        {visible.map((d, idx) => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {customizing && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => move(d.key, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  style={{ ...arrowStyle, opacity: idx === 0 ? 0.3 : 1 }}
                >
                  ▲
                </button>
                <button
                  onClick={() => move(d.key, 1)}
                  disabled={idx === visible.length - 1}
                  title="Move down"
                  style={{ ...arrowStyle, opacity: idx === visible.length - 1 ? 0.3 : 1 }}
                >
                  ▼
                </button>
              </div>
            )}
            <NavLink to={d.to} end={d.to === '/'} style={{ flex: 1 }}>
              {d.label}
              {d.key === 'approvals' && pendingApprovals > 0 && (
                <span
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                    marginLeft: 6,
                  }}
                >
                  {pendingApprovals}
                </span>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="main">
        <div className="topbar">
          <div>
            <Link to="/account" style={{ color: 'inherit', textDecoration: 'none' }}>
              <strong>{user?.name}</strong>
            </Link>
            <span className="muted" style={{ marginLeft: 8 }}>
              {user?.role}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="muted" style={{ fontSize: 12 }}>
              Financial Year
            </label>
            <select value={selectedFy} onChange={(e) => setSelectedFy(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8 }}>
              {fys.map((fy) => (
                <option key={fy} value={fy}>
                  {fy}
                </option>
              ))}
            </select>
            {can('manage_financial_years') && (
              <button className="btn btn-sm" onClick={onAddFy} title="Create a new financial year">
                + FY
              </button>
            )}
            <button className="btn btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

const arrowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.15)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 9,
  lineHeight: '12px',
  cursor: 'pointer',
  padding: '1px 3px',
};
