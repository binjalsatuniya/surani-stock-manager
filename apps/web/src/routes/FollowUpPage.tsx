import { useEffect, useMemo, useState } from 'react';
import type { Party, SalesPerson } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

// A dedicated tab for follow-ups: for each company, how many days after which the sales person
// should follow up. Editable inline and saved as you go. Gated by `manage_followup` (JAYNIL only for
// now); grant that permission to a sales person and they get their own Follow-up tab.
export function FollowUpPage() {
  const can = usePermission();
  const allowed = can('manage_followup');

  const [parties, setParties] = useState<Party[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [query, setQuery] = useState('');
  const [spFilter, setSpFilter] = useState('');
  // Per-row editing state: the text in the box, and a transient "saved / error" flag.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'saved' | 'saving' | 'error'>>({});

  async function reload() {
    const rows = await api.parties.list();
    setParties(rows);
    setDraft(Object.fromEntries(rows.map((p) => [p.id, p.followUpDays != null ? String(p.followUpDays) : ''])));
  }

  useEffect(() => {
    if (!allowed) return;
    reload().catch(() => {});
    api.salesPersons.list().then(setSalesPersons).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const salesPersonName = (id: string | null) => (id ? salesPersons.find((s) => s.id === id)?.name || '—' : '—');

  // Companies only — transporters and handling agents are not sales follow-up targets.
  const companies = useMemo(
    () => parties.filter((p) => p.type === 'debtor' || p.type === 'creditor' || p.type === 'both'),
    [parties]
  );

  const shown = companies.filter((p) => {
    if (spFilter === 'none' ? p.salesPersonId : spFilter && p.salesPersonId !== spFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q);
  });

  async function save(p: Party) {
    const raw = (draft[p.id] ?? '').trim();
    const value = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
    if (raw !== '' && Number.isNaN(Number(raw))) {
      setStatus((s) => ({ ...s, [p.id]: 'error' }));
      return;
    }
    // No change from what is saved — do nothing.
    if ((p.followUpDays ?? null) === value) return;
    setStatus((s) => ({ ...s, [p.id]: 'saving' }));
    try {
      await api.parties.update(p.id, { followUpDays: value });
      setParties((ps) => ps.map((x) => (x.id === p.id ? { ...x, followUpDays: value } : x)));
      setStatus((s) => ({ ...s, [p.id]: 'saved' }));
      setTimeout(() => setStatus((s) => ({ ...s, [p.id]: undefined as never })), 1500);
    } catch {
      setStatus((s) => ({ ...s, [p.id]: 'error' }));
    }
  }

  if (!allowed) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Follow-up</h2>
        <p className="muted">You don't have access to the Follow-up list.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0 }}>
        Follow-up <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— after how many days to follow up with each company</span>
      </h2>

      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>Search</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company name or phone…" />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label>Sales Person</label>
          <select value={spFilter} onChange={(e) => setSpFilter(e.target.value)}>
            <option value="">All</option>
            <option value="none">— None assigned —</option>
            {salesPersons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Type</th>
                <th>Sales Person</th>
                <th>Phone</th>
                <th style={{ width: 220 }}>Follow-up after (days)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.type}</td>
                  <td>{salesPersonName(p.salesPersonId)}</td>
                  <td>{p.phone || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min="0"
                        value={draft[p.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        onBlur={() => save(p)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        placeholder="e.g. 15"
                        style={{ width: 100 }}
                      />
                      <span style={{ fontSize: 12, minWidth: 44 }}>
                        {status[p.id] === 'saving' && <span className="muted">saving…</span>}
                        {status[p.id] === 'saved' && <span style={{ color: '#15803d', fontWeight: 700 }}>✓ saved</span>}
                        {status[p.id] === 'error' && <span style={{ color: '#dc2626', fontWeight: 700 }}>error</span>}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">No companies to show.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
