import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const IconRectangle = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="14" />
    <circle cx="4" cy="5" r="1.2" fill="currentColor" />
    <circle cx="20" cy="5" r="1.2" fill="currentColor" />
    <circle cx="20" cy="19" r="1.2" fill="currentColor" />
    <circle cx="4" cy="19" r="1.2" fill="currentColor" />
  </svg>
);

export const IconPolygon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l8 6-3 10H7L4 9z" />
    <circle cx="12" cy="3" r="1.2" fill="currentColor" />
    <circle cx="20" cy="9" r="1.2" fill="currentColor" />
    <circle cx="17" cy="19" r="1.2" fill="currentColor" />
    <circle cx="7" cy="19" r="1.2" fill="currentColor" />
    <circle cx="4" cy="9" r="1.2" fill="currentColor" />
  </svg>
);

export const IconClear = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v11M7 10l5 5 5-5M4 19h16" />
  </svg>
);

export const IconRetry = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4" />
  </svg>
);

export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="1" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </svg>
);

export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSave = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </svg>
);

export const IconEdit = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20h4l11-11-4-4L4 16z M13 7l4 4" />
  </svg>
);

export const IconLayers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5" />
  </svg>
);

export const IconGenerate = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
  </svg>
);

export const IconQueue = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

export const IconHistory = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" />
  </svg>
);

export const IconStop = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

export const IconEye = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M9.9 5.2A10.4 10.4 0 0 1 12 5c6 0 10 7 10 7a17.7 17.7 0 0 1-3.2 3.9M6.1 6.1C3.6 7.9 2 12 2 12s4 7 10 7c1.5 0 2.9-.4 4.1-1" />
  </svg>
);

export const IconMapPin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const IconWarning = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l10 18H2z M12 10v4M12 17.5v.5" />
  </svg>
);

export const IconInfo = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.5" />
  </svg>
);

export const IconZap = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </svg>
);

export const IconFit = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16.5 16.5L21 21" />
  </svg>
);

export const IconMore = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const IconGrid = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4h16v16H4z M4 12h16 M12 4v16" />
  </svg>
);

export const IconUser = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 19.5c1.8-3.2 4.1-4.5 7-4.5s5.2 1.3 7 4.5" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 16l4-4-4-4M9 12h10" />
  </svg>
);

export const IconDashboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="5" rx="1" />
    <rect x="13" y="10" width="8" height="11" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
  </svg>
);
