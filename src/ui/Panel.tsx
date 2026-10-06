/**
 * Panel: the single reusable inspector primitive used by both docks.
 *
 * Every section shares one chrome: an uppercase 10px letter-spaced heading with
 * a chevron collapse toggle, an optional right-aligned action slot, and a body
 * that unmounts when collapsed. Sections default to open so the E2E suite can
 * address their controls directly; collapsing is a user-only affordance.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { IconChevron } from './icons';

export interface PanelProps {
  readonly title: string;
  readonly testId?: string;
  readonly headingTestId?: string;
  readonly ariaLabel?: string;
  readonly defaultOpen?: boolean;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Panel({
  title,
  testId,
  headingTestId,
  ariaLabel,
  defaultOpen = true,
  actions,
  children,
  className,
}: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const classes = className === undefined ? 'panel' : `panel ${className}`;

  return (
    <section className={classes} data-testid={testId} aria-label={ariaLabel}>
      <div className="panel-header">
        <button
          type="button"
          className="panel-heading"
          data-testid={headingTestId}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <IconChevron className={open ? 'panel-chevron open' : 'panel-chevron'} />
          <span className="panel-title">{title}</span>
        </button>
        {actions === undefined ? null : <div className="panel-actions">{actions}</div>}
      </div>
      {open ? <div className="panel-body">{children}</div> : null}
    </section>
  );
}
