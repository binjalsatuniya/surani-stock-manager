import { useState } from 'react';
import { NAV_SHORTCUTS, getNavKey } from '../hooks/useAppShortcuts';
import { usePermission } from '../hooks/usePermission';

// On/off flags (read live by the handlers).
export const SHORTCUT_KEYS = { enterNav: 'shortcut.enterNav', escSave: 'shortcut.escSave', navKeys: 'shortcut.navKeys' } as const;
export function shortcutEnabled(key: keyof typeof SHORTCUT_KEYS): boolean {
  return localStorage.getItem(SHORTCUT_KEYS[key]) !== 'off';
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ display: 'inline-block', whiteSpace: 'nowrap', background: '#f1f5f9', border: '1px solid #cbd5e1', borderBottomWidth: 2, borderRadius: 6, padding: '2px 9px', fontWeight: 700, fontSize: 12.5, fontFamily: 'inherit' }}>
      {children}
    </kbd>
  );
}

const FIXED: { key: string; what: string }[] = [
  { key: 'Enter', what: 'Move to the next field; on the last field it saves (clicks Save / Add).' },
  { key: 'Shift + Enter', what: 'Move back to the previous field.' },
  { key: 'Esc', what: 'In an edit form, asks whether to save your unsaved changes.' },
  { key: 'Ctrl + S', what: 'Save the form you are in (clicks Save / Add).' },
  { key: 'Enter', what: 'In a pop-up box, confirms it (OK / Save / Delete).' },
  { key: 'Esc', what: 'In a pop-up box, cancels it.' },
];

export function ShortcutsPage() {
  const canEdit = usePermission()('edit_shortcuts');
  const [enterNav, setEnterNav] = useState(shortcutEnabled('enterNav'));
  const [escSave, setEscSave] = useState(shortcutEnabled('escSave'));
  const [navKeys, setNavKeys] = useState(shortcutEnabled('navKeys'));
  // Local copy of the editable nav keys so the inputs re-render on change.
  const [navMap, setNavMap] = useState<Record<string, string>>(
    Object.fromEntries(NAV_SHORTCUTS.map((n) => [n.to, getNavKey(n.to, n.defaultKey)]))
  );

  function toggle(key: keyof typeof SHORTCUT_KEYS, value: boolean, setter: (v: boolean) => void) {
    localStorage.setItem(SHORTCUT_KEYS[key], value ? 'on' : 'off');
    setter(value);
  }

  function setNavKey(to: string, raw: string) {
    const letter = (raw.slice(-1) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (letter) localStorage.setItem(`navkey.${to}`, letter);
    setNavMap((m) => ({ ...m, [to]: letter }));
  }

  const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '150px 1fr', gap: 14, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #eef2f7' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Keyboard Shortcuts</h2>
        <p className="muted" style={{ marginTop: 0 }}>Faster data entry on the website and desktop app.</p>

        {FIXED.map((s, i) => (
          <div key={i} style={{ ...rowStyle, ...(i === 0 ? { borderTop: 'none' } : {}) }}>
            <Kbd>{s.key}</Kbd>
            <span>{s.what}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Jump to a section</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Hold <strong>Alt</strong> and press the letter.{canEdit ? ' You can change any letter below.' : ' (View only — an admin controls these.)'}
        </p>
        {NAV_SHORTCUTS.map((n) => (
          <div key={n.to} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Kbd>Alt</Kbd> <span style={{ color: '#94a3b8' }}>+</span>
              <input
                value={(navMap[n.to] || '').toUpperCase()}
                onChange={(e) => setNavKey(n.to, e.target.value)}
                maxLength={1}
                disabled={!canEdit}
                style={{ width: 42, textAlign: 'center', textTransform: 'uppercase', fontWeight: 700 }}
              />
            </div>
            <span>{n.label}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Turn shortcuts on / off</h3>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
          <input type="checkbox" disabled={!canEdit} checked={enterNav} onChange={(e) => toggle('enterNav', e.target.checked, setEnterNav)} />
          <span><strong>Enter</strong> moves to the next field and saves on the last field</span>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
          <input type="checkbox" disabled={!canEdit} checked={escSave} onChange={(e) => toggle('escSave', e.target.checked, setEscSave)} />
          <span><strong>Esc</strong> asks to save unsaved changes in an edit form</span>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
          <input type="checkbox" disabled={!canEdit} checked={navKeys} onChange={(e) => toggle('navKeys', e.target.checked, setNavKeys)} />
          <span><strong>Alt + key</strong> section jumps, and <strong>Ctrl + S</strong> to save</span>
        </label>
        <p className="muted" style={{ fontSize: 12 }}>Changes apply immediately on this device.</p>
      </div>
    </div>
  );
}
