import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../utils';

export interface MenuItem {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function Menu({
  trigger,
  sections,
  align = 'right',
  header,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => React.ReactNode;
  sections: MenuItem[][];
  align?: 'left' | 'right';
  header?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute top-full z-[90] mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-float',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            {header}
            {sections
              .filter((s) => s.length)
              .map((items, i) => (
                <div key={i} className={cn(i > 0 && 'mt-1.5 border-t border-line pt-1.5')}>
                  {items.map((it) => (
                    <button
                      key={it.label}
                      role="menuitem"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(false);
                        it.onClick();
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-40',
                        it.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-ink/5',
                      )}
                    >
                      {it.icon && <it.icon className={cn('h-4 w-4 shrink-0', !it.danger && 'text-ink-3')} />}
                      <span className="flex-1">{it.label}</span>
                      {it.hint && <span className="text-[11px] text-ink-3">{it.hint}</span>}
                    </button>
                  ))}
                </div>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
