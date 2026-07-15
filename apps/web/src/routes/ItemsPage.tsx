import { useEffect, useState } from 'react';
import type { Item, ItemUnit } from '@surani/shared';
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
  rate: '0',
  opening: '0',
  reorder: '0',
};

export function ItemsPage() {
  const can = usePermission();
  const { required } = useFieldSettings();
  const canEdit = can('edit_items');
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
      rate: Number(form.rate) || 0,
      opening: Number(form.opening) || 0,
      reorder: Number(form.reorder) || 0,
      rateDate: null,
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
      rate: String(i.rate ?? 0),
      opening: String(i.opening ?? 0),
      reorder: String(i.reorder ?? 0),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
              <FieldLabel required={required('item.code')}>Code</FieldLabel>
              <input value={form.code} onChange={(e) => set('code', e.target.value)} style={{ width: 100 }} />
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
              {canEdit && (
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => onEdit(i)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(i.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
