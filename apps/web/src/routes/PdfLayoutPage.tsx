import { useEffect, useState } from 'react';
import { PDF_SETTINGS, defaultPdfLayout, type PdfLayout, type PdfSettingKey } from '@surani/shared';
import { api } from '../lib/apiClient';
import { clearPdfLayoutCache } from '../lib/pdfLayout';
import { SURANI_LOGO_DATA_URI } from '../lib/suraniLogoData';

export function PdfLayoutPage() {
  const [draft, setDraft] = useState<PdfLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.pdfSettings
      .get()
      .then(setDraft)
      .catch(() => setDraft(defaultPdfLayout()));
  }, []);

  function set(key: PdfSettingKey, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setSaved(false);
  }

  async function onSave() {
    if (!draft) return;
    setError('');
    setSaving(true);
    try {
      let latest = draft;
      // Save each field; the API returns the full merged layout each time.
      for (const s of PDF_SETTINGS) {
        latest = await api.pdfSettings.update(s.key, draft[s.key]);
      }
      setDraft(latest);
      clearPdfLayoutCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Make sure the pdf_settings migration has been run in Neon.');
    } finally {
      setSaving(false);
    }
  }

  async function onResetAll() {
    if (!confirm('Reset all PDF layout settings back to their defaults?')) return;
    setError('');
    setSaving(true);
    try {
      let latest = draft ?? defaultPdfLayout();
      for (const s of PDF_SETTINGS) {
        latest = await api.pdfSettings.reset(s.key);
      }
      setDraft(latest);
      clearPdfLayoutCache();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <div className="card">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          PDF Layout <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— header, address, footer &amp; colour of every PDF</span>
        </h2>
        <p className="muted">
          These settings change the look of all generated PDFs — Party Ledger, Outstanding Dues and the Sales Person
          Expense Ledger. The amounts and table contents are never changed here; only the heading, address, footer note
          and colour.
        </p>
        {error && <div className="login-err show">{error}</div>}

        <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, maxWidth: 520 }}>
          {PDF_SETTINGS.map((s) => (
            <div className="field" style={{ margin: 0 }} key={s.key}>
              <label>{s.label}</label>
              {s.type === 'color' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={draft[s.key] || '#0f766e'} onChange={(e) => set(s.key, e.target.value)} style={{ width: 48, height: 34, padding: 2 }} />
                  <input value={draft[s.key]} onChange={(e) => set(s.key, e.target.value)} style={{ width: 120 }} />
                </div>
              ) : (
                <input value={draft[s.key]} onChange={(e) => set(s.key, e.target.value)} placeholder={s.default || '(blank)'} />
              )}
              {s.hint && (
                <span className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                  {s.hint}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn btn-sm" onClick={onResetAll} disabled={saving}>
            Reset all to default
          </button>
          {saved && <span className="muted" style={{ alignSelf: 'center', color: '#15803d' }}>Saved ✓</span>}
        </div>
      </div>

      {/* Live preview of the PDF header + footer */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Preview</h3>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={SURANI_LOGO_DATA_URI} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: draft.accent_color || '#147b8b' }}>
                {draft.company_name || 'SURANI AND SONS'} <span style={{ color: '#334155' }}>— Party Ledger</span>
              </div>
              {draft.tagline.trim() && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#5b7076', marginTop: 1 }}>{draft.tagline}</div>}
            </div>
          </div>
          {draft.address.trim() && <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4 }}>{draft.address}</div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginTop: 6 }}>Sample Party · Generated today</div>
          <div style={{ marginTop: 14, border: '1px dashed #cbd5e1', borderRadius: 6, padding: 12, color: '#94a3b8', fontSize: 12 }}>
            (ledger table appears here)
          </div>
          {draft.footer.trim() && (
            <div style={{ marginTop: 20, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
              {draft.footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
