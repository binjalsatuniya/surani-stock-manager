import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// In-app confirm / prompt dialogs that replace the browser's native window.confirm/prompt.
// Native dialogs can freeze the Electron desktop app; these render inside the app and support
// Enter (confirm) / Esc (cancel). Promise-based so callers can `await` a yes/no or text answer.

type Pending =
  | { kind: 'confirm'; message: string; okLabel: string; cancelLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; okLabel: string; cancelLabel: string; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (message: string, opts?: { okLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
  promptText: (message: string, opts?: { defaultValue?: string; okLabel?: string; cancelLabel?: string }) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback<DialogApi['confirm']>((message, opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', message, okLabel: opts?.okLabel ?? 'OK', cancelLabel: opts?.cancelLabel ?? 'Cancel', danger: opts?.danger ?? false, resolve });
    });
  }, []);

  const promptText = useCallback<DialogApi['promptText']>((message, opts) => {
    return new Promise<string | null>((resolve) => {
      setText(opts?.defaultValue ?? '');
      setPending({ kind: 'prompt', message, defaultValue: opts?.defaultValue ?? '', okLabel: opts?.okLabel ?? 'OK', cancelLabel: opts?.cancelLabel ?? 'Cancel', resolve });
    });
  }, []);

  // Focus the input when a prompt opens.
  useEffect(() => {
    if (pending?.kind === 'prompt') setTimeout(() => inputRef.current?.focus(), 30);
  }, [pending]);

  function settle(value: boolean | string | null) {
    if (!pending) return;
    if (pending.kind === 'confirm') pending.resolve(value as boolean);
    else pending.resolve(value as string | null);
    setPending(null);
  }

  function onOk() {
    if (!pending) return;
    if (pending.kind === 'confirm') settle(true);
    else settle(text);
  }
  function onCancel() {
    if (!pending) return;
    settle(pending.kind === 'confirm' ? false : null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); onOk(); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  return (
    <DialogContext.Provider value={{ confirm, promptText }}>
      {children}
      {pending && (
        <div
          onKeyDown={onKeyDown}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          <div className="card" style={{ maxWidth: 440, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,.3)' }}>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: 14 }}>{pending.message}</div>
            {pending.kind === 'prompt' && (
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ width: '100%', marginBottom: 14 }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={onCancel}>{pending.cancelLabel}</button>
              <button
                className={`btn btn-sm ${pending.kind === 'confirm' && pending.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={onOk}
                autoFocus={pending.kind === 'confirm'}
              >
                {pending.okLabel}
              </button>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 8, textAlign: 'right' }}>Enter = {pending.okLabel} · Esc = {pending.cancelLabel}</div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used within DialogProvider');
  return ctx;
}
