import { useEffect } from 'react';

// Enter moves focus to the next field in the same form/card; on the last field it triggers the
// form's primary (Save/Add) button. Textareas keep Enter for newlines. This is the data-entry flow
// JAYNIL asked for: Enter walks through the fields and saves at the end.
export function useEnterKeyNav() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return; // newlines / native button behavior
      if (tag !== 'INPUT' && tag !== 'SELECT') return;
      const input = target as HTMLInputElement;
      const skip = ['checkbox', 'radio', 'button', 'submit', 'file', 'range'];
      if (tag === 'INPUT' && skip.includes(input.type)) return;

      const container = (target.closest('form, .card') as HTMLElement) || document.body;
      const fields = (Array.from(container.querySelectorAll('input, select')) as HTMLInputElement[]).filter(
        (el) => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null && !skip.includes(el.type)
      );
      const idx = fields.indexOf(input);
      if (idx === -1) return;

      e.preventDefault();
      if (idx < fields.length - 1) {
        const next = fields[idx + 1];
        next.focus();
        if (typeof next.select === 'function' && next.tagName === 'INPUT') next.select();
      } else {
        // Last field → click the primary action button (Save / Add) in this container.
        const btn = container.querySelector('button.btn-primary:not([disabled])') as HTMLButtonElement | null;
        btn?.click();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
