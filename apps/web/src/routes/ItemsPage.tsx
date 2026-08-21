import { fmtAmount } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildWhatsappLink, type Item, type ItemUnit } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useEscToClose } from '../hooks/useEscToClose';
import { useDialogs } from '../components/Dialogs';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';
import { dataUrlToBlob, looksLikePdf } from '../lib/dataUrl';

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
  const { confirm } = useDialogs();
  // `url` is a blob: URL — a data: URL will not render in the PDF frame. See lib/dataUrl.ts.
  const [tdsView, setTdsView] = useState<{ url: string; name: string; isPdf: boolean } | null>(null);
  const { required } = useFieldSettings();
  const canAdd = can('add_items');
  const canEditRow = can('edit_items');
  const canDelete = can('delete_items');
  const canEdit = canAdd || canEditRow || canDelete; // show the form/actions if any of the three
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  // True once a new TDS file is picked; only then do we send it on save (the list no longer carries
  // the existing TDS, so without this an edit would blank it out).
  const [tdsChanged, setTdsChanged] = useState(false);
  const [error, setError] = useState('');
  useEscToClose(!!tdsView, () => closeTds());

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
    const base = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit: form.unit,
      code: form.code.trim() || null,
      gstPct: Number(form.gstPct) || 0,
      rate: Number(form.rate) || 0,
      opening: Number(form.opening) || 0,
      reorder: Number(form.reorder) || 0,
      rateDate: null,
    };
    const tds = { tdsAttachment: form.tdsAttachment || null, tdsAttachmentName: form.tdsAttachmentName || null };
    try {
      if (editingId) {
        // Only send the TDS on edit when a new one was picked (or it was removed) — otherwise omit
        // it so the existing file is kept, since the list no longer carries it.
        await api.items.update(editingId, tdsChanged ? { ...base, ...tds } : base);
      } else {
        await api.items.create({ ...base, ...tds });
      }
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
      tdsAttachment: '', // the list no longer carries the blob; fetched on demand when viewing
      tdsAttachmentName: i.tdsAttachmentName || '',
    });
    setTdsChanged(false);
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
      setTdsChanged(true);
    };
    reader.readAsDataURL(file);
  }

  // Fetch an item's TDS on demand (the list omits it), then show it.
  async function openTdsById(id: string, name: string) {
    try {
      const res = await api.items.getTds(id);
      if (res.tdsAttachment) openTds(res.tdsAttachment, res.tdsAttachmentName || name);
      else setError('No TDS is attached to this item.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the TDS');
    }
  }

  // Download the TDS, then open WhatsApp so the user can pick the party and attach it (WhatsApp Web
  // does not allow auto-attaching a file — this is the same flow as the Dues PDF share).
  // A data: URL will not render in the PDF frame, so show the TDS from a blob: URL instead.
  function openTds(attachment: string | null | undefined, fileName: string) {
    if (!attachment) return;
    const name = fileName || 'TDS';
    const blob = dataUrlToBlob(attachment);
    if (!blob) {
      setError('The attached TDS could not be read — it may have been saved incompletely.');
      return;
    }
    closeTds(); // release any previously opened blob
    setTdsView({ url: URL.createObjectURL(blob), name, isPdf: looksLikePdf(blob, name) });
  }

  function closeTds() {
    setTdsView((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function shareTds(i: Item) {
    const res = await api.items.getTds(i.id).catch(() => null);
    const attachment = res?.tdsAttachment;
    if (!attachment) {
      setError('The attached TDS could not be read.');
      return;
    }
    const blob = dataUrlToBlob(attachment);
    if (!blob) {
      setError('The attached TDS could not be read.');
      return;
    }
    // Download via a blob URL — a multi-MB data: URL can exceed the browser's href limit.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = i.tdsAttachmentName || `${i.name}-TDS`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); // let the download start first
    window.open(buildWhatsappLink(null, `TDS — ${i.name}`), '_blank');
  }

  async function onDelete(id: string) {
    if (!(await confirm('Delete this item?', { okLabel: 'Delete', danger: true }))) return;
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
              <input
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                style={{ width: 190 }}
                placeholder="39046100, 39041020"
              />
              <span className="muted" style={{ fontSize: 10.5, marginTop: 3, maxWidth: 190 }}>
                List several, separated by commas, if the same product is invoiced under more than
                one HSN — Import from Scans will match any of them.
              </span>
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
                    onClick={() =>
                      form.tdsAttachment
                        ? openTds(form.tdsAttachment, form.tdsAttachmentName)
                        : editingId
                          ? openTdsById(editingId, form.tdsAttachmentName)
                          : undefined
                    }
                    style={{ cursor: 'pointer', color: '#147b8b' }}
                  >
                    view
                  </a>{' · '}
                  <a
                    onClick={() => {
                      set('tdsAttachment', '');
                      set('tdsAttachmentName', '');
                      setTdsChanged(true); // so saving actually removes it
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
            <th></th>
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
              <td>{fmtAmount(i.rate)}</td>
              <td>{i.opening}</td>
              <td>{i.reorder}</td>
              <td>
                {i.tdsAttachmentName ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openTdsById(i.id, i.tdsAttachmentName || i.name)} title="Open the TDS">
                      📄 View
                    </button>
                    <button className="btn btn-sm" onClick={() => shareTds(i)} title="Download the TDS and open WhatsApp to send it">
                      📤 WhatsApp
                    </button>
                  </div>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <Link to={`/items/${i.id}/ledger`}>View Ledger</Link>
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
              <td colSpan={canEdit ? 10 : 9} className="muted">
                No items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {tdsView && (
        <div
          onClick={closeTds}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: 900, height: '85%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ flex: 1 }}>📄 {tdsView.name}</strong>
              <button className="btn btn-sm" onClick={() => window.open(tdsView.url, '_blank')}>
                Open in new tab
              </button>
              <a className="btn btn-sm" href={tdsView.url} download={tdsView.name} style={{ textDecoration: 'none' }}>
                Download
              </a>
              <button className="btn btn-sm" onClick={closeTds}>Close</button>
            </div>
            {tdsView.isPdf ? (
              <iframe src={tdsView.url} title={tdsView.name} style={{ flex: 1, border: 'none', width: '100%' }} />
            ) : (
              <img src={tdsView.url} alt={tdsView.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', margin: 'auto' }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
