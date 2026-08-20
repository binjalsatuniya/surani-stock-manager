import { useEffect } from 'react';

/**
 * Close a popup when the Escape key is pressed. Pass whether the popup is open and its close handler;
 * the listener is only attached while it's open. Used to give every modal consistent Esc-to-close.
 */
export function useEscToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
