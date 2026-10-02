import { useEffect } from 'react';

// Force every text entry in the app to UPPERCASE as the user types — so names, addresses, notes etc.
// are always capitals even with Caps Lock off, with no need to touch each input. A single capture-phase
// 'input' listener rewrites the value before React's own onChange reads it, so the stored value is
// uppercased too (not just displayed).
//
// Case-sensitive inputs are left alone: password / email / url / number / tel / date-time / search by
// type, and anything marked `data-nocaps` (e.g. the login username, a saved map URL).
const SKIP_TYPES = new Set([
  'password',
  'email',
  'url',
  'number',
  'tel',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
  'file',
  'checkbox',
  'radio',
  'color',
  'range',
  'hidden',
]);

export function useForceUppercase() {
  useEffect(() => {
    function onInput(e: Event) {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
      if (tag === 'INPUT' && SKIP_TYPES.has((t as HTMLInputElement).type)) return;
      if (t.closest('[data-nocaps]')) return;
      const up = t.value.toUpperCase();
      if (up === t.value) return;
      const start = t.selectionStart;
      const end = t.selectionEnd;
      t.value = up; // React's onChange (bubble phase) now reads the uppercased value → stored uppercase
      try {
        if (start != null && end != null) t.setSelectionRange(start, end);
      } catch {
        /* some input types don't support selection range */
      }
    }
    document.addEventListener('input', onInput, true); // capture: runs before React's handler
    return () => document.removeEventListener('input', onInput, true);
  }, []);
}
