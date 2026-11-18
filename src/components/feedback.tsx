import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button, IconButton, Modal } from './ui';
import { cn } from '../utils';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export const useFeedback = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFeedback fuori da FeedbackProvider');
  return ctx;
};

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3500);
    },
    [dismiss],
  );

  const confirm = useCallback((opts: ConfirmOptions) => {
    setDialog(opts);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      <Modal open={!!dialog} onClose={() => close(false)} className="sm:max-w-md" labelledBy="confirm-title">
        {dialog && (
          <div className="p-6">
            <div className="flex gap-4">
              <div
                className={cn(
                  'h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center',
                  dialog.danger ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand',
                )}
              >
                {dialog.danger ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h2 id="confirm-title" className="font-serif text-xl font-semibold text-ink">
                  {dialog.title}
                </h2>
                <div className="mt-1.5 text-sm text-ink-2 leading-relaxed">{dialog.message}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button onClick={() => close(false)}>Annulla</Button>
              <Button
                autoFocus
                variant={dialog.danger ? 'primary' : 'primary'}
                className={dialog.danger ? '!bg-danger !text-white' : ''}
                onClick={() => close(true)}
              >
                {dialog.confirmLabel ?? 'Conferma'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = icons[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-float"
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0',
                    t.kind === 'success' && 'text-brand',
                    t.kind === 'error' && 'text-danger',
                    t.kind === 'info' && 'text-brass',
                  )}
                />
                <p className="text-sm text-ink leading-snug">{t.message}</p>
                <IconButton label="Chiudi notifica" size="sm" onClick={() => dismiss(t.id)} className="-mr-1 -my-1">
                  <X className="h-4 w-4" />
                </IconButton>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
