import type { ReactNode } from 'react';
import { ChefPig, type ChefPigExpression } from './ChefPig';

interface Props {
  expression?: ChefPigExpression;
  heading: string;
  children?: ReactNode;
  /** Buttons or links. */
  actions?: ReactNode;
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/** Chef + Fraunces heading + body + optional actions. */
export function EmptyState({ expression = 'thinking', heading, children, actions, headingLevel = 'h2' }: Props) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <ChefPig size={88} expression={expression} />
      <Heading className="font-display text-2xl font-semibold tracking-tight text-foreground">{heading}</Heading>
      {children && <div className="max-w-sm text-[15px] leading-relaxed text-muted">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
