import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchSelectOption {
  id: string;
  label: string;
}

/**
 * A type-to-search dropdown (combobox) — replaces a native <select> so the user can type any part
 * of a name to filter the list, instead of the browser only jumping to names by first letter.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Type to search…',
  disabled = false,
  allowClear = true,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);
  // Closed: show the chosen name. Open: show what the user is typing.
  const inputValue = open ? query : selected?.label ?? '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            setQuery('');
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{ width: '100%', paddingRight: 26 }}
        autoComplete="off"
      />
      {/* dropdown arrow — makes it read as a dropdown you can also type into */}
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          if (!disabled) {
            setQuery('');
            setOpen((v) => !v);
          }
        }}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#64748b',
          fontSize: 11,
          pointerEvents: disabled ? 'none' : 'auto',
          cursor: 'pointer',
        }}
      >
        ▾
      </span>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            maxHeight: 260,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          }}
        >
          {allowClear && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                choose('');
              }}
              style={{ padding: '8px 10px', cursor: 'pointer', color: '#64748b' }}
            >
              Select…
            </div>
          )}
          {filtered.map((o) => (
            <div
              key={o.id}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o.id);
              }}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                background: o.id === value ? '#f0fdfa' : '#fff',
              }}
            >
              {o.label}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '8px 10px', color: '#94a3b8' }}>No matches</div>}
        </div>
      )}
    </div>
  );
}
