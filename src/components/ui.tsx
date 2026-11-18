import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../utils';
import type { Gender, Person } from '../types';
import { initials, isDeceased } from '../lib/family';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:border-line-2 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-ink/5 hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
  soft: 'bg-brand-soft text-brand hover:brightness-95',
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }
>(({ variant = 'secondary', size = 'md', className, ...props }, ref) => (
  <button
    ref={ref}
    {...props}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap',
      size === 'sm' && 'h-8 px-3 text-xs',
      size === 'md' && 'h-10 px-4 text-sm',
      size === 'lg' && 'h-12 px-5 text-[15px]',
      variants[variant],
      className,
    )}
  />
));
Button.displayName = 'Button';

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: ButtonVariant; size?: 'sm' | 'md' }
>(({ label, variant = 'ghost', size = 'md', className, ...props }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    {...props}
    className={cn(
      'inline-flex items-center justify-center rounded-xl transition-all active:scale-90 disabled:opacity-40 disabled:pointer-events-none shrink-0',
      size === 'md' ? 'h-10 w-10' : 'h-8 w-8',
      variants[variant],
      className,
    )}
  />
));
IconButton.displayName = 'IconButton';

const genderTone: Record<Gender, string> = {
  male: 'bg-male-soft text-male ring-male/40',
  female: 'bg-female-soft text-female ring-female/40',
  other: 'bg-other-soft text-other ring-other/40',
};

export function Avatar({
  person,
  size = 40,
  className,
  rounded = 'full',
}: {
  person: Pick<Person, 'firstName' | 'lastName' | 'gender' | 'photoUrl' | 'deathDate' | 'deceased'>;
  size?: number;
  className?: string;
  rounded?: 'full' | 'xl';
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [person.photoUrl]);
  const showPhoto = person.photoUrl && !broken;
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden ring-1 flex items-center justify-center font-serif font-semibold',
        rounded === 'full' ? 'rounded-full' : 'rounded-2xl',
        genderTone[person.gender] ?? genderTone.other,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {showPhoto ? (
        <img
          src={person.photoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={cn('h-full w-full object-cover', isDeceased(person) && 'grayscale-[60%]')}
        />
      ) : (
        initials(person)
      )}
    </div>
  );
}

/** Pila delle modali aperte: Esc chiude solo quella in primo piano. */
const modalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    modalStack.push(token);
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || modalStack[modalStack.length - 1] !== token) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[autofocus],input,button')?.focus());
    return () => {
      window.removeEventListener('keydown', onKey, true);
      modalStack.splice(modalStack.indexOf(token), 1);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
            className={cn(
              'relative w-full bg-surface border border-line shadow-float rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col overflow-hidden',
              className,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ModalHeader({ title, subtitle, onClose, id }: { title: string; subtitle?: string; onClose: () => void; id?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-line">
      <div>
        <h2 id={id} className="font-serif text-2xl font-semibold text-ink leading-tight">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-ink-3 mt-1">{subtitle}</p>}
      </div>
      <IconButton label="Chiudi" onClick={onClose} className="-mr-2 -mt-1">
        <X className="h-5 w-5" />
      </IconButton>
    </div>
  );
}

export const inputClass =
  'w-full h-11 rounded-xl bg-surface-2 border border-line px-3.5 text-[15px] text-ink placeholder:text-ink-3/70 outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10 aria-[invalid=true]:border-danger';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface-2 px-1 text-[10px] font-medium text-ink-3">
      {children}
    </kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin', className)} />;
}

export const isModalOpen = () => modalStack.length > 0;
