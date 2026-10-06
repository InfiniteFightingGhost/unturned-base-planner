/**
 * Inline SVG icon set for the editor chrome.
 *
 * Icons are intentionally dependency-free (no icon library) and inherit color
 * from `currentColor`, so active/hover states are pure CSS. Every icon is a
 * 16x16 stroked glyph tuned for the dense 46px tool strip and 24px panel rows.
 */

import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconSelect(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3l6.5 16 2.2-6.3L20 10.5 5 3z" />
    </Icon>
  );
}

export function IconPlace(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" />
      <path d="M12 3v8m0 0l7-4m-7 4l-7-4" />
      <path d="M12 21v-8" />
    </Icon>
  );
}

export function IconMove(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2v20M2 12h20" />
      <path d="M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3" />
      <path d="M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
    </Icon>
  );
}

export function IconRotate(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Icon>
  );
}

export function IconMeasure(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9l6-6 12 12-6 6L3 9z" />
      <path d="M8 7l2 2M11 10l2 2M6 12l2 2M14 13l2 2" />
    </Icon>
  );
}

export function IconBlueprint(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3h18v18H3z" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </Icon>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Icon width={12} height={12} {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 7H5V3" />
      <path d="M5 7a8 8 0 1 1 1.6 10.9" />
    </Icon>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 7h4V3" />
      <path d="M19 7a8 8 0 1 0-1.6 10.9" />
    </Icon>
  );
}

export function IconDuplicate(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Icon>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </Icon>
  );
}

export function IconNew(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export function IconSave(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h7V3M8 21v-7h8v7" />
    </Icon>
  );
}

export function IconExport(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

export function IconImport(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15V3" />
      <path d="M7 8l5-5 5 5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

export function IconBuilt(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Icon>
  );
}

export function IconPlanned(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </Icon>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Icon>
  );
}
