import type { ReactNode } from 'react';

/** A form label that shows a red asterisk when the field is mandatory (per Field Rules). */
export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label>
      {children}
      {required && <span style={{ color: '#ef4444', marginLeft: 3, fontWeight: 700 }}>*</span>}
    </label>
  );
}
