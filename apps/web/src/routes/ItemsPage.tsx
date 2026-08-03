import { useEffect, useState } from 'react';
import { buildWhatsappLink, type Item, type ItemUnit } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';

const UNITS: ItemUnit[] = ['KG', 'MT', 'pcs'];

const EMPTY = {
  name: '',
  category: '',
  unit: 'KG' as ItemUnit,
  code: '',
  gstPct: '0',
  rate: '0',
  opening: '0',
  reorder: '0',
  tdsAttachment: '',
  tdsAttachmentName: '',
};

export function ItemsPage() {
  const can = usePermission();
  const { required } = useFieldSettings();
  const canAdd = can('add_items');
  const canEditRow = can('edit_items');
  const canDelete = can('delete_items');
  const canEdit = canAdd || canEditRow || canDelete; // show the form/actions if any of the three
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function reload() {
    setItems(await api.items.list());
  }

  useEffect(() => {
    reload();
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
    if (required('item.category') && !form.category.trim()) return setError('Category is required.');
    if (required('item.code') && !form.code.trim()) return setError('Code / HSN is required.');
    if (required('item.reorder') && !(Number(form.reorder) > 0)) return setError('Reorder / low-stock level is required.');
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit: form.unit,
      code: form.code.trim() || null,
      gstPct: Number(form.gstPct) || 0,
      rate: Number(form.rate) || 0,
      opening: Number(form.opening) || 0,
      reorder: Number(form.reorder) || 0,
      rateDate: null,
      tdsAttachment: form.tdsAttachment || null,
      tdsAttachmentName: form.tdsAttachmentName || null,
    };
    try {
      if (editingId) await api.items.update(editingId, payload);
      else await api.items.create(payload);
      resetForm();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save item');
    }
  }

  function onEdit(i: Item) {
    setEditingId(i.id);
    setForm({
      name: i.name,
      category: i.category || '',
      unit: i.unit,
      code: i.code || '',
      gstPct: String(i.gstPct ?? 0),
      rate: String(i.rate ?? 0),
      opening: String(i.opening ?? 0),
      reorder: String(i.reorder ?? 0),
      tdsAttachment: i.tdsAttachment || '',
      tdsAttachmentName: i.tdsAttachmentName || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onPickTds(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('TDS file is too large (max 5 MB). Please attach a smaller PDF/image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set('tdsAttachment', String(reader.result));
      set('tdsAttachmentName', file.name);
    };
    reader.readAsDataURL(file);
  }

  // Download the TDS, then open WhatsApp so the user can pick the party and attach it (WhatsApp Web
  // does not allow auto-attaching a file — this is the same flow as the Dues PDF share).
  function shareTds(i: Item) {
    if (!i.tdsAttachment) return;
    const a = document.createElement('a');
    a.href = i.tdsAttachment;
    a.download = i.tdsAttachmentName || `${i.name}-TDS`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.open(buildWhatsappLink(null, `TDS — ${i.name}`), '_blank');
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this item?')) return;
    await api.items.remove(id);
    if (editingId === id) resetForm();
    reload();
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Item' : 'Item Master'}</h2>
      {canEdit && (
        <>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('item.category')}>Category</FieldLabel>
              <input value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('item.code')}>HSN Code</FieldLabel>
              <input value={form.code} onChange={(e) => set('code', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>GST %</label>
              <select value={form.gstPct} onChange={(e) => set('gstPct', e.target.value)}>
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Unit</label>
              <select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Rate</label>
              <input value={form.rate} onChange={(e) => set('rate', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Opening Qty</label>
              <input value={form.opening} onChange={(e) => set('opening', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('item.reorder')}>Reorder Level</FieldLabel>
              <input value={form.reorder} onChange={(e) => set('reorder', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 220 }}>
              <label>TDS (Technical Data Sheet)</label>
              <input type="file" accept="application/pdf,image/*" onChange={onPickTds} />
              {form.tdsAttachmentName && (
                <span className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                  📄 {form.tdsAttachmentName}{' '}
                  <a
                    onClick={() => {
                      set('tdsAttachment', '');
                      set('tdsAttachmentName', '');
                    }}
                    style={{ cursor: 'pointer', color: '#dc2626' }}
                  >
                    remove
                  </a>
                </span>
              )}
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" onClick={onSave}>
              {editingId ? 'Save Changes' : 'Add Item'}
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
      <table style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Code</th>
            <th>Unit</th>
            <th>Rate</th>
            <th>Opening</th>
            <th>Reorder</th>
            <th>TDS</th>
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>{i.category || '—'}</td>
              <td>{i.code || '—'}</td>
              <td>{i.unit}</td>
              <td>{i.rate}</td>
              <td>{i.opening}</td>
              <td>{i.reorder}</td>
              <td>
                {i.tdsAttachment ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={i.tdsAttachment} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }} title="Open the TDS">
                      📄 View
                    </a>
                    <button className="btn btn-sm" onClick={() => shareTds(i)} title="Download the TDS and open WhatsApp to send it">
                      📤 WhatsApp
                    </button>
                  </div>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              {canEdit && (
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {canEditRow && (
                      <button className="btn btn-sm" onClick={() => onEdit(i)}>
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(i.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 9 : 8} className="muted">
                No items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
