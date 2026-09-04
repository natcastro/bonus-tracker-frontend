type IconProps = { size?: number; color?: string };

function base(size = 22, color = "currentColor") {
  return {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
}

export function GlobeIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" />
    </svg>
  );
}

export function ToolsIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z" />
    </svg>
  );
}

export function ChartIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
    </svg>
  );
}

export function PackageIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}

export function PaletteIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.6 1.6-1.4 0-.4-.2-.7-.4-1a1.5 1.5 0 0 1 1.1-2.5H16a4 4 0 0 0 4-4C20 7 16.6 3 12 3Z" />
      <circle cx="7.5" cy="10.5" r="1" fill={color ?? "currentColor"} stroke="none" />
      <circle cx="10.5" cy="7" r="1" fill={color ?? "currentColor"} stroke="none" />
      <circle cx="15" cy="8" r="1" fill={color ?? "currentColor"} stroke="none" />
    </svg>
  );
}

export function HeadsetIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M19.5 19v.5A3.5 3.5 0 0 1 16 23h-2" />
    </svg>
  );
}

export function WaveIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M3 12h2l2-7 3 14 3-11 2 4h6" />
    </svg>
  );
}

export function BookIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  );
}

export function BellIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function TrashIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6 7l1 13.5A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function SearchIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function PencilIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M13.5 4.5 19.5 10.5 8 22H2v-6Z" />
      <path d="M11.5 6.5l6 6" />
    </svg>
  );
}

export function EyeIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function HubIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="17" r="2.2" />
      <circle cx="19" cy="17" r="2.2" />
      <path d="M12 7.2v3.3M10.3 12.7 6.7 15M13.7 12.7l3.6 2.3" />
    </svg>
  );
}

export function ClockIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function GearIcon({ size, color }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9c.14.36.4.66.72.85.32.19.7.28 1.07.24H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
