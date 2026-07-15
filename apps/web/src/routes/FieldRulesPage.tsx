import { useEffect, useState } from 'react';
import { FIELD_SETTINGS, effectiveFieldSettings, type FieldSettingsMap } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export function FieldRulesPage() {
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const [settings, setSettings] = useState<FieldSettingsMap>(() => effectiveFieldSettings({}));
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.fieldSettings.get().then(setSettings);
  }, []);

  async function onToggle(key: string, required: boolean) {
    setError('');
    setBusyKey(key);
    try {
      const next = await api.fieldSettings.set(key, required);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusyKey('');
    }
  }

  // Group the fields by their section for display.
  const groups = Array.from(new Set(FIELD_SETTINGS.map((f) => f.group)));

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Field Rules</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Choose which optional fields must be filled in before a record can be saved. Only the Super Admin can
        change these; everyone else's forms follow the rules set here.
      </p>
      {!isSuper && <div className="muted" style={{ marginBottom: 12 }}>View only — ask the Super Admin to change these.</div>}
      {error && <div className="login-err show">{error}</div>}

      {groups.map((group) => (
        <div key={group} style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 8 }}>{group}</h3>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_SETTINGS.filter((f) => f.group === group).map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        disabled={!isSuper || busyKey === f.key}
                        checked={!!settings[f.key]}
                        onChange={(e) => onToggle(f.key, e.target.checked)}
                      />
                      <span>{settings[f.key] ? 'Mandatory' : 'Optional'}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
