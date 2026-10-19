import type { ReactNode } from 'react';

export type IconName =
  | 'overview' | 'inbox' | 'route' | 'database' | 'report'
  | 'check' | 'x' | 'pause' | 'alert' | 'ban' | 'spinner' | 'circle'
  | 'sun' | 'moon' | 'monitor' | 'search' | 'upload' | 'file' | 'plus' | 'refresh'
  | 'chevron-left' | 'chevron-right' | 'copy' | 'sparkle' | 'info';

const paths: Record<IconName, ReactNode> = {
  overview: <path d="M3.5 3.5h5v5h-5zM11.5 3.5h5v3h-5zM11.5 9.5h5v7h-5zM3.5 11.5h5v5h-5z" />,
  inbox: <path d="M3 11l2.2-6h9.6L17 11v5H3zM3 11h4.2l.9 2h3.8l.9-2H17" />,
  route: (
    <>
      <circle cx="5" cy="14.5" r="2" />
      <circle cx="15" cy="5.5" r="2" />
      <path d="M7 14.5h3.5a3 3 0 003-3v-4M7.5 14.5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="10" cy="5" rx="6" ry="2.4" />
      <path d="M4 5v10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V5M4 10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" />
    </>
  ),
  report: <path d="M5 2.8h7l3 3v11.4H5zM12 2.8v3.2h3M7.6 10h4.8M7.6 13h4.8" />,
  check: <path d="M4.5 10.5l3.6 3.6 7.4-8" />,
  x: <path d="M5.2 5.2l9.6 9.6M14.8 5.2l-9.6 9.6" />,
  pause: <path d="M7.4 5v10M12.6 5v10" />,
  alert: <path d="M10 3.2l7.6 13.2H2.4zM10 8.2v3.6M10 14.2v.1" />,
  ban: (
    <>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M5.4 5.4l9.2 9.2" />
    </>
  ),
  spinner: <path d="M10 3.2a6.8 6.8 0 106.8 6.8" />,
  circle: <circle cx="10" cy="10" r="6.5" />,
  sun: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </>
  ),
  moon: <path d="M16.2 12.2A6.8 6.8 0 017.8 3.8a6.8 6.8 0 108.4 8.4z" />,
  monitor: <path d="M3 4.5h14v9H3zM7.5 16.5h5M10 13.5v3" />,
  search: (
    <>
      <circle cx="8.8" cy="8.8" r="5.2" />
      <path d="M12.7 12.7l4 4" />
    </>
  ),
  upload: <path d="M10 13V4M6.6 7.4L10 4l3.4 3.4M4 12.5v3.2h12v-3.2" />,
  file: <path d="M5 2.8h6.2L15 6.6v10.6H5zM11 2.8v4h4" />,
  plus: <path d="M10 4v12M4 10h12" />,
  refresh: <path d="M16.2 10a6.2 6.2 0 11-2-4.6M16.4 3.8v3.6h-3.6" />,
  'chevron-left': <path d="M12 4.5L6.5 10l5.5 5.5" />,
  'chevron-right': <path d="M8 4.5l5.5 5.5L8 15.5" />,
  copy: <path d="M7.5 7.5h8v8h-8zM12.5 7.5v-3h-8v8h3" />,
  sparkle: <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" />,
  info: (
    <>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M10 9v4.2M10 6.7v.1" />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className = '' }: Props) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

/** The Handoff mark: a route climbing to an amber waypoint. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1d2f4b" />
      <path d="M7 21 L14 14 L18 18 L25 10" fill="none" stroke="#6da7ec" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="10" r="3" fill="#fab219" />
    </svg>
  );
}
