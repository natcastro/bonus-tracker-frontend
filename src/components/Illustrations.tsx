// Line illustrations for cards — marketing / business themed, one ink, a single filled accent.
// They replace the small icon chips so cards read like editorial tiles. All use currentColor.
type P = { size?: number; color?: string };
const svg = (size: number, color: string) => ({
  width: size, height: size, viewBox: "0 0 100 100", fill: "none", stroke: color, strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

// Megaphone — campaigns / briefs
export function Megaphone({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <rect x={16} y={39} width={14} height={22} />
      <path d="M30 39L70 20v60L30 61" />
      <path d="M70 20v60" />
      <circle cx={50} cy={50} r={3} fill={color} />
      <path d="M78 40c4 3 6 6 6 10s-2 7-6 10" />
      <path d="M85 30c7 5 10 12 10 20s-3 15-10 20" />
    </svg>
  );
}

// Growth chart with arrow — performance / dashboards
export function GrowthChart({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M12 86h78" />
      <rect x={18} y={60} width={12} height={26} />
      <rect x={38} y={46} width={12} height={40} />
      <rect x={58} y={52} width={12} height={34} fill={color} />
      <rect x={78} y={30} width={12} height={56} />
      <path d="M16 44l22-16 18 10 28-24" />
      <path d="M72 14h12v12" />
    </svg>
  );
}

// Funnel — leads / sales pipeline
export function Funnel({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M18 28H82L56 58V82H44V58Z" />
      <path d="M32 40H68M40 50H60" />
      <circle cx={34} cy={12} r={2.2} />
      <circle cx={50} cy={8} r={2.2} />
      <circle cx={66} cy={12} r={2.2} />
      <circle cx={50} cy={70} r={3} fill={color} />
    </svg>
  );
}

// Calendar with check — planning / to-do
export function CalendarCheck({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <rect x={14} y={20} width={72} height={66} />
      <path d="M14 38h72M32 12v16M68 12v16" />
      {[0, 1, 2, 3].map(c => [0, 1].map(r => (
        <rect key={`${c}${r}`} x={22 + c * 16} y={46 + r * 16} width={10} height={9} fill={c === 2 && r === 1 ? color : "none"} />
      )))}
      <path d="M24 78l4 4 8-9" />
    </svg>
  );
}

// Social post: phone with heart and play — content / links
export function SocialPost({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <rect x={30} y={10} width={40} height={80} rx={4} />
      <path d="M44 16h12" />
      <rect x={36} y={24} width={28} height={28} />
      <path d="M46 31l9 7-9 7Z" fill={color} />
      <path d="M36 62h28M36 70h18" />
      <path d="M84 30c-4-6-12-2-9 5l9 9 9-9c3-7-5-11-9-5Z" transform="translate(-4 -6) scale(0.9)" />
      <circle cx={18} cy={62} r={3} /><circle cx={12} cy={74} r={2} />
    </svg>
  );
}

// Bullseye with arrow — goals / focus
export function Bullseye({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <circle cx={46} cy={54} r={34} /><circle cx={46} cy={54} r={23} /><circle cx={46} cy={54} r={12} />
      <circle cx={46} cy={54} r={3} fill={color} />
      <path d="M46 54L84 16M76 14l10-2-2 10-6-1-1-6Z" />
    </svg>
  );
}

// Envelope — messages / outreach
export function Envelope({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <rect x={12} y={26} width={76} height={52} />
      <path d="M12 28l38 28 38-28" />
      <circle cx={84} cy={26} r={7} fill={color} />
      <path d="M12 78l28-26M88 78L60 52" />
    </svg>
  );
}

// Palette frame — design / creative
export function Canvas({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <rect x={12} y={16} width={76} height={58} />
      <circle cx={32} cy={36} r={7} />
      <path d="M12 66l22-18 16 14 14-10 24 18" />
      <path d="M30 84h40M50 74v10" />
      <circle cx={72} cy={32} r={3} fill={color} />
    </svg>
  );
}

// Radial dots — Hub: FTC USA
export function DotDisc({ size = 84, color = "currentColor" }: P) {
  const dots: [number, number][] = [];
  for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < ring * 6; i++) {
    const a = (i / (ring * 6)) * Math.PI * 2 + ring * 0.4, r = ring * 10.5;
    dots.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  return (
    <svg {...svg(size, color)}>
      {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.9} />)}
      <circle cx={50} cy={50} r={2.6} fill={color} />
    </svg>
  );
}

// Stacked discs — Hub: Marketing
export function Layers({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      {[20, 33, 46, 59].map(y => <ellipse key={y} cx={50} cy={y} rx={30} ry={10} />)}
      <ellipse cx={50} cy={72} rx={30} ry={10} fill={color} />
      <path d="M20 20v52M80 20v52" />
    </svg>
  );
}

// Dot matrix with a few filled — Hub: FTC México
export function DotGrid({ size = 84, color = "currentColor" }: P) {
  const filled = new Set(["5-0", "1-1", "7-2", "3-5", "6-6"]);
  const cells = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) {
    cells.push(<circle key={`${c}-${r}`} cx={10 + c * 10} cy={14 + r * 10.2} r={2} fill={filled.has(`${c}-${r}`) ? color : "none"} />);
  }
  return <svg {...svg(size, color)}>{cells}</svg>;
}

// Serpentine line — Hub: Management
export function Serpentine({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M86 24H22a9 9 0 0 0 0 18h56a9 9 0 0 1 0 18H22a9 9 0 0 0 0 18h60" />
      <circle cx={86} cy={24} r={2.6} fill={color} />
      <path d="M76 73l8 5-8 5" />
    </svg>
  );
}

// Concentric rings — Hub: HR, tools
export function Rings({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      {[40, 32, 24, 16].map(r => <circle key={r} cx={50} cy={50} r={r} />)}
      <circle cx={50} cy={50} r={7} />
      <circle cx={50} cy={50} r={2.4} fill={color} />
    </svg>
  );
}


// ── Candidate replacements for the megaphone (Briefs) — shown in /styleguide before choosing ──
export function BriefDoc({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M26 10h34l16 16v64H26Z" /><path d="M60 10v16h16" />
      <path d="M36 40h30M36 50h30M36 60h18" />
      <rect x={36} y={70} width={14} height={9} fill={color} />
      <path d="M72 62l14-14 6 6-14 14-8 2Z" />
    </svg>
  );
}
export function Clipboard({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <rect x={20} y={16} width={60} height={74} />
      <rect x={36} y={8} width={28} height={14} fill="var(--paper, #fff)" />
      {[38, 56, 74].map((y, i) => (
        <g key={y}><rect x={30} y={y - 5} width={9} height={9} fill={i === 0 ? color : "none"} /><path d={`M46 ${y}h26`} /></g>
      ))}
    </svg>
  );
}
export function Folder({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M12 26h28l8 10h40v46H12Z" />
      <path d="M12 44h76" />
      <rect x={24} y={54} width={20} height={4} fill={color} />
      <path d="M24 66h40M24 74h28" />
    </svg>
  );
}
export function Stack({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M50 14L88 32 50 50 12 32Z" />
      <path d="M12 46l38 18 38-18" />
      <path d="M12 60l38 18 38-18" />
      <circle cx={50} cy={32} r={3} fill={color} />
    </svg>
  );
}
export function Presentation({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <path d="M12 16h76M18 16v50h64V16" />
      <path d="M28 56V44M42 56V34M56 56V40M70 56V28" />
      <rect x={66} y={26} width={8} height={2} fill={color} />
      <path d="M50 66v14M38 90l12-10 12 10" />
    </svg>
  );
}
export function Compass({ size = 84, color = "currentColor" }: P) {
  return (
    <svg {...svg(size, color)}>
      <circle cx={50} cy={50} r={36} /><circle cx={50} cy={50} r={28} />
      <path d="M50 14v6M50 80v6M14 50h6M80 50h6" />
      <path d="M62 38L54 54 38 62l8-16Z" fill={color} />
      <circle cx={50} cy={50} r={2} fill="var(--paper, #fff)" stroke="none" />
    </svg>
  );
}

export const ILLUSTRATIONS = {
  briefDoc: BriefDoc, clipboard: Clipboard, folder: Folder, stack: Stack, presentation: Presentation, compass: Compass,
  dots: DotDisc, layers: Layers, grid: DotGrid, line: Serpentine, rings: Rings,
  megaphone: Megaphone, chart: GrowthChart, funnel: Funnel, calendar: CalendarCheck,
  post: SocialPost, target: Bullseye, mail: Envelope, canvas: Canvas,
};
export type IllustrationKind = keyof typeof ILLUSTRATIONS;
export function Illustration({ kind, ...p }: P & { kind: IllustrationKind }) {
  const C = ILLUSTRATIONS[kind];
  return <C {...p} />;
}
