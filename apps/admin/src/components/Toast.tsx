import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  /** Show a transient toast. `durationMs` default 5000 (§7.3 Undo window). */
  show: (t: ToastState, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (t: ToastState, durationMs = 5000) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      timer.current = setTimeout(() => setToast(null), durationMs);
    },
    [],
  );

  useEffect(() => () => clear(), [clear]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <div className="toast-host">
          <div className="toast" role="status">
            <span>{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                onClick={() => {
                  toast.onAction?.();
                  clear();
                }}
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
