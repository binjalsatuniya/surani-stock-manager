import { useEffect, useState } from 'react';
import { WHATSAPP_TEMPLATES, type WhatsappTemplateKey } from '@surani/shared';
import { api } from '../lib/apiClient';

export function WhatsappSettingsPage() {
  const [drafts, setDrafts] = useState<Record<WhatsappTemplateKey, string> | null>(null);
  const [savingKey, setSavingKey] = useState<WhatsappTemplateKey | null>(null);
  const [savedKey, setSavedKey] = useState<WhatsappTemplateKey | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.whatsapp.list().then((rows) => {
      const next = {} as Record<WhatsappTemplateKey, string>;
      rows.forEach((r) => (next[r.key] = r.template));
      setDrafts(next);
    });
  }, []);

  async function onSave(key: WhatsappTemplateKey) {
    if (!drafts) return;
    setError('');
    setSavingKey(key);
    try {
      const row = await api.whatsapp.update(key, drafts[key]);
      setDrafts((prev) => (prev ? { ...prev, [key]: row.template } : prev));
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setSavingKey(null);
    }
  }

  async function onReset(key: WhatsappTemplateKey) {
    if (!confirm('Reset this message to its default text?')) return;
    setError('');
    try {
      const row = await api.whatsapp.reset(key);
      setDrafts((prev) => (prev ? { ...prev, [key]: row.template } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset template');
    }
  }

  if (!drafts) return <div className="card">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>WhatsApp Messages</h2>
        <p className="muted">
          Customize the wording of messages sent via WhatsApp. Use the placeholder tokens shown under each
          message — they get replaced with real values (party name, amount, date, etc.) when a message is sent.
        </p>
        {error && <div className="login-err show">{error}</div>}
      </div>

      {WHATSAPP_TEMPLATES.map((t) => (
        <div className="card" key={t.key}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t.label}</h3>
          <p className="muted" style={{ marginTop: 0 }}>{t.description}</p>
          <div className="field">
            <textarea
              rows={10}
              value={drafts[t.key] ?? ''}
              onChange={(e) => setDrafts((prev) => (prev ? { ...prev, [t.key]: e.target.value } : prev))}
            />
          </div>
          <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {t.placeholders.map((p) => (
              <span
                key={p.token}
                title={p.description}
                className="muted"
                style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}
              >
                {p.token}
              </span>
            ))}
          </div>
          <div className="toolbar" style={{ margin: 0 }}>
            <button className="btn btn-primary btn-sm" disabled={savingKey === t.key} onClick={() => onSave(t.key)}>
              {savingKey === t.key ? 'Saving…' : savedKey === t.key ? 'Saved ✓' : 'Save'}
            </button>
            <button className="btn btn-sm" onClick={() => onReset(t.key)}>
              Reset to default
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
