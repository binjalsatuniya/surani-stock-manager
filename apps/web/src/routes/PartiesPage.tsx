import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildTelLink } from '@surani/shared';
import type { Party, PartyType, SalesPerson } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';

const TYPES: { value: PartyType; label: string }[] = [
  { value: 'debtor', label: 'Debtor (owes you)' },
  { value: 'creditor', label: 'Creditor (you owe)' },
  { value: 'both', label: 'Both' },
  { value: 'transporter', label: 'Transporter' },
  { value: 'handling', label: 'Handling Agent' },
];

const EMPTY = {
  name: '',
  type: 'debtor' as PartyType,
  salesPersonId: '',
  phone: '',
  email: '',
  gst: '',
  opening: '0',
  creditDays: '0',
  defaultFreight: '0',
  address: '',
  locationUrl: '',
  vehicle: '',
};

export function PartiesPage() {
  const can = usePermission();
  const { required } = useFieldSettings();
  const canEditRow = can('edit_parties') || can('edit_transporters');
  const canDelete = can('delete_parties') || can('edit_transporters');
  const canEdit = can('add_parties') || canEditRow || canDelete;
  const [parties, setParties] = useState<Party[]>([]);
  const [query, setQuery] = useState('');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Sales-person management
  const [spName, setSpName] = useState('');
  const [spPhone, setSpPhone] = useState('');
  const [spEditingId, setSpEditingId] = useState<string | null>(null);

  async function reload() {
    setParties(await api.parties.list());
  }
  async function reloadSalesPersons() {
    setSalesPersons(await api.salesPersons.list());
  }

  useEffect(() => {
    reload();
    reloadSalesPersons();
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);
  }

  async function onSave() {
    setError('');
    if (!form.name.trim()) return;
    if (required('party.salesPerson') && !form.salesPersonId) return setError('Sales person is required.');
    if (required('party.phone') && !form.phone.trim()) return setError('Phone / WhatsApp number is required.');
    if (required('party.email') && !form.email.trim()) return setError('Email is required.');
    if (required('party.gst') && !form.gst.trim()) return setError('GST number is required.');
    if (required('party.address') && !form.address.trim()) return setError('Address is required.');
    if (required('party.locationUrl') && !form.locationUrl.trim()) return setError('Location link is required.');
    if (required('party.vehicle') && !form.vehicle.trim()) return setError('Vehicle is required.');
    const payload = {
      name: form.name.trim(),
      type: form.type,
      salesPersonId: form.salesPersonId || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gst: form.gst.trim() || null,
      opening: Number(form.opening) || 0,
      creditDays: Number(form.creditDays) || 0,
      defaultFreight: Number(form.defaultFreight) || 0,
      address: form.address.trim() || null,
      locationUrl: form.locationUrl.trim() || null,
      vehicle: form.vehicle.trim() || null,
    };
    try {
      if (editingId) await api.parties.update(editingId, payload);
      else await api.parties.create(payload);
      resetForm();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save party');
    }
  }

  function onEdit(p: Party) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      salesPersonId: p.salesPersonId || '',
      phone: p.phone || '',
      email: p.email || '',
      gst: p.gst || '',
      opening: String(p.opening ?? 0),
      creditDays: String(p.creditDays ?? 0),
      defaultFreight: String(p.defaultFreight ?? 0),
      address: p.address || '',
      locationUrl: p.locationUrl || '',
      vehicle: p.vehicle || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this party?')) return;
    await api.parties.remove(id);
    if (editingId === id) resetForm();
    reload();
  }

  async function onSaveSalesPerson() {
    if (!spName.trim()) return;
    if (spEditingId) {
      await api.salesPersons.update(spEditingId, { name: spName.trim(), phone: spPhone.trim() || null });
    } else {
      await api.salesPersons.create({ name: spName.trim(), phone: spPhone.trim() || undefined });
    }
    setSpName('');
    setSpPhone('');
    setSpEditingId(null);
    reloadSalesPersons();
  }
  function onEditSalesPerson(s: SalesPerson) {
    setSpEditingId(s.id);
    setSpName(s.name);
    setSpPhone(s.phone || '');
  }
  async function onDeleteSalesPerson(id: string) {
    if (!confirm('Delete this sales person?')) return;
    await api.salesPersons.remove(id);
    reloadSalesPersons();
  }

  const salesPersonName = (id: string | null) =>
    id ? salesPersons.find((s) => s.id === id)?.name || '—' : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Party' : 'Party Master'}</h2>
        {canEdit && (
          <>
            <div className="toolbar">
              <div className="field" style={{ margin: 0 }}>
                <label>Name</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Type</label>
                <select value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <FieldLabel required={required('party.salesPerson')}>Sales Person</FieldLabel>
                <select value={form.salesPersonId} onChange={(e) => set('salesPersonId', e.target.value)}>
                  <option value="">— none —</option>
                  {salesPersons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <FieldLabel required={required('party.phone')}>WhatsApp / Phone</FieldLabel>
                <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 919876543210" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <FieldLabel required={required('party.email')}>Email</FieldLabel>
                <input value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <FieldLabel required={required('party.gst')}>GST No.</FieldLabel>
                <input value={form.gst} onChange={(e) => set('gst', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Opening Balance (₹)</label>
                <input value={form.opening} onChange={(e) => set('opening', e.target.value)} style={{ width: 120 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Credit Days</label>
                <input value={form.creditDays} onChange={(e) => set('creditDays', e.target.value)} style={{ width: 90 }} />
                <span className="muted" style={{ fontSize: 10.5, marginTop: 3, maxWidth: 160 }}>
                  Applies to sales (debtor) only. Purchases from creditors are due immediately.
                </span>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Default Freight (₹/unit)</label>
                <input value={form.defaultFreight} onChange={(e) => set('defaultFreight', e.target.value)} style={{ width: 120 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <FieldLabel required={required('party.vehicle')}>Vehicle (transporters)</FieldLabel>
                <input value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
                <FieldLabel required={required('party.address')}>Address</FieldLabel>
                <input value={form.address} onChange={(e) => set('address', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
                <FieldLabel required={required('party.locationUrl')}>Location Link (Google Maps)</FieldLabel>
                <input value={form.locationUrl} onChange={(e) => set('locationUrl', e.target.value)} placeholder="https://maps.google.com/..." />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 4 }}>
              <button className="btn btn-primary" onClick={onSave}>
                {editingId ? 'Save Changes' : 'Add Party'}
              </button>
              {editingId && (
                <button className="btn btn-sm" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
        {error && <div className="login-err show">{error}</div>}
        <div className="field" style={{ margin: '14px 0 0', maxWidth: 320 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Search parties by name, phone or GST…"
            style={{ width: '100%' }}
          />
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Sales Person</th>
              <th>Phone</th>
              <th>GST</th>
              <th>Credit Days</th>
              <th>Opening</th>
              <th></th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {parties
              .filter((p) => {
                const q = query.trim().toLowerCase();
                if (!q) return true;
                return (
                  p.name.toLowerCase().includes(q) ||
                  (p.phone || '').toLowerCase().includes(q) ||
                  (p.gst || '').toLowerCase().includes(q)
                );
              })
              .map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.type}</td>
                <td>{salesPersonName(p.salesPersonId)}</td>
                <td>
                  {p.phone ? (
                    <a href={buildTelLink(p.phone)} className="btn btn-sm" style={{ textDecoration: 'none' }} title={`Call ${p.phone}`}>
                      📞 {p.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{p.gst || '—'}</td>
                <td>{p.creditDays}</td>
                <td>{p.opening}</td>
                <td>
                  <Link to={`/parties/${p.id}/ledger`}>View Ledger</Link>
                </td>
                {canEdit && (
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canEditRow && (
                        <button className="btn btn-sm" onClick={() => onEdit(p)}>
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn btn-sm btn-danger" onClick={() => onDelete(p.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {parties.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No parties yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Sales Persons</h3>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>Name</label>
              <input value={spName} onChange={(e) => setSpName(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Phone</label>
              <input value={spPhone} onChange={(e) => setSpPhone(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={onSaveSalesPerson}>
              {spEditingId ? 'Save Changes' : 'Add Sales Person'}
            </button>
            {spEditingId && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  setSpEditingId(null);
                  setSpName('');
                  setSpPhone('');
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {salesPersons.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.phone || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => onEditSalesPerson(s)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => onDeleteSalesPerson(s.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {salesPersons.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No sales persons yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
