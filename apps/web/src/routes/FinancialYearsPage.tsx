import { useState } from 'react';
import { api } from '../lib/apiClient';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useDialogs } from '../components/Dialogs';

// JAYNIL-only settings page to create and delete financial years.
export function FinancialYearsPage() {
  const { fys, selectedFy, setSelectedFy, refreshFys } = useFinancialYear();
  const { confirm } = useDialogs();
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  async function onCreate() {
    setError('');
    const v = label.trim();
    if (!/^\d{4}-\d{2}$/.test(v)) return setError('Use the format 2026-27.');
    try {
      await api.financialYears.create(v);
      setLabel('');
      refreshFys();
      setSelectedFy(v);
    } catch {
      setError('Could not create that financial year.');
    }
  }

  async function onDelete(fy: string) {
    if (!(await confirm(`Delete financial year ${fy}?\n\nNote: if any entry is dated in this year, it will still appear (the list is built from your data too).`, { okLabel: 'Delete', danger: true }))) return;
    try {
      await api.financialYears.remove(fy);
      refreshFys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that financial year.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 620 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Financial Years</h2>
        <p className="muted" style={{ marginTop: 0 }}>Create or remove the financial years available in the top dropdown.</p>

        <div className="toolbar" style={{ marginBottom: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>New Financial Year</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 2026-27" style={{ width: 140 }} />
          </div>
          <button className="btn btn-primary" onClick={onCreate}>+ Create</button>
        </div>
        {error && <div className="login-err show">{error}</div>}

        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Financial Year</th><th>Period</th><th></th></tr></thead>
          <tbody>
            {fys.map((fy) => {
              const start = parseInt(fy.split('-')[0], 10);
              return (
                <tr key={fy}>
                  <td style={{ fontWeight: 600 }}>{fy}{fy === selectedFy ? <span className="muted" style={{ fontWeight: 400 }}> (current)</span> : ''}</td>
                  <td className="muted">01/04/{start} – 31/03/{start + 1}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => onDelete(fy)}>Delete</button></td>
                </tr>
              );
            })}
            {fys.length === 0 && <tr><td colSpan={3} className="muted">No financial years yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
