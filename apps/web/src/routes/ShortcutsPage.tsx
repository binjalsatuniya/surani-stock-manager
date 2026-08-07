import { useState } from 'react';

// Keyboard shortcuts reference + simple on/off toggles (saved in this browser). The two behaviours
// read these flags live, so turning one off here disables it immediately.
export const SHORTCUT_KEYS = { enterNav: 'shortcut.enterNav', escSave: 'shortcut.escSave' } as const;
export function shortcutEnabled(key: keyof typeof SHORTCUT_KEYS): boolean {
  return localStorage.getItem(SHORTCUT_KEYS[key]) !== 'off';
}

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: 'Enter', what: 'Move to the next field; on the last field it saves (clicks Save/Add).' },
  { keys: 'Esc', what: 'In an edit form, asks whether to save your unsaved changes.' },
  { keys: 'Enter', what: 'In a pop-up box, confirms it (OK / Save / Delete).' },
  { keys: 'Esc', what: 'In a pop-up box, cancels it.' },
];

export function ShortcutsPage() {
  const [enterNav, setEnterNav] = useState(shortcutEnabled('enterNav'));
  const [escSave, setEscSave] = useState(shortcutEnabled('escSave'));

  function toggle(key: keyof typeof SHORTCUT_KEYS, value: boolean, setter: (v: boolean) => void) {
    localStorage.setItem(SHORTCUT_KEYS[key], value ? 'on' : 'off');
    setter(value);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Keyboard Shortcuts</h2>
        <p className="muted" style={{ marginTop: 0 }}>These make data entry faster on the website and desktop app.</p>
        <table>
          <thead>
            <tr><th style={{ width: 90 }}>Key</th><th>What it does</th></tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s, i) => (
              <tr key={i}>
                <td><kbd style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 5, padding: '2px 8px', fontWeight: 700 }}>{s.keys}</kbd></td>
                <td>{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Turn shortcuts on / off</h3>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
          <input type="checkbox" checked={enterNav} onChange={(e) => toggle('enterNav', e.target.checked, setEnterNav)} />
          <span><strong>Enter</strong> moves to the next field and saves on the last field</span>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
          <input type="checkbox" checked={escSave} onChange={(e) => toggle('escSave', e.target.checked, setEscSave)} />
          <span><strong>Esc</strong> asks to save unsaved changes in an edit form</span>
        </label>
        <p className="muted" style={{ fontSize: 12 }}>Changes apply immediately on this device.</p>
      </div>
    </div>
  );
}
