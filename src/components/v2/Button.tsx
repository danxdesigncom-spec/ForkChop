'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon';

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  variant?: Variant;
  /** Leading icon, rendered aria-hidden. */
  icon?: ReactNode;
  /** Trailing icon, rendered aria-hidden. */
  trailingIcon?: ReactNode;
  /** Full width of the container. */
  block?: boolean;
  /**
   * Why the button is disabled, shown to screen readers via aria-describedby.
   * Pass the id of an element holding the reason.
   */
  disabledReasonId?: string;
};

/** An `icon` button has no visible text, so it must carry an accessible name. */
export type ButtonProps =
  | (BaseProps & { variant: 'icon'; 'aria-label': string })
  | (BaseProps & { variant?: Exclude<Variant, 'icon'>; 'aria-label'?: string });

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  secondary: 'bg-surface text-foreground border border-border hover:border-line-strong',
  ghost: 'bg-transparent text-brand hover:bg-brand-soft',
  icon: 'bg-raised text-foreground hover:bg-border',
};

/**
 * v2 button. 48px tall (44px on small screens), radius 12, 15px/600 label.
 * Disabled uses the raised fill and thyme text and keeps a described reason.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    icon,
    trailingIcon,
    block,
    disabled,
    disabledReasonId,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isIcon = variant === 'icon';
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-describedby={disabled && disabledReasonId ? disabledReasonId : rest['aria-describedby']}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-colors',
        isIcon ? 'h-11 w-11 sm:h-12 sm:w-12' : 'min-h-11 px-5 sm:min-h-12',
        block && 'w-full',
        disabled ? 'cursor-not-allowed bg-raised text-muted border-0' : VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon && <span aria-hidden="true" className="inline-flex">{icon}</span>}
      {children}
      {trailingIcon && <span aria-hidden="true" className="inline-flex">{trailingIcon}</span>}
    </button>
  );
});
