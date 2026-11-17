import h2 from "../assets/birds/happy/h2.webp";
import h3 from "../assets/birds/happy/h3.webp";
import h4 from "../assets/birds/happy/h4.webp";
import h7 from "../assets/birds/happy/h7.webp";
import h8 from "../assets/birds/happy/h8.webp";
import bird100 from "../assets/birds/bird-100.png";
import bird90 from "../assets/birds/bird-90.png";
import bird80 from "../assets/birds/bird-80.png";
import bird70 from "../assets/birds/bird-70.png";
import bird60 from "../assets/birds/bird-60.png";
import bird50 from "../assets/birds/bird-50.png";
import bird40 from "../assets/birds/bird-40.png";
import bird30 from "../assets/birds/bird-30.png";
import bird20 from "../assets/birds/bird-20.png";
import bird10 from "../assets/birds/bird-10.png";
import bird0 from "../assets/birds/bird-0.png";

// Mood mascot for To Do — same idea as moodBunny, just this little bird instead.
// The three happy tiers play a short frame sequence (wings up/down, eyes open/closed, hearts...) instead of a still.
// `ms` = how long each frame is held. See Mascot.tsx.
export type MascotFrame = { src: string; ms: number };
const FRAMES_90: MascotFrame[] = [{ src: h2, ms: 800 }, { src: h7, ms: 800 }, { src: h2, ms: 800 }, { src: h4, ms: 700 }];
const FRAMES_80: MascotFrame[] = [{ src: h3, ms: 1000 }, { src: h4, ms: 700 }, { src: h8, ms: 800 }, { src: h4, ms: 700 }];

export const MOOD_BIRDS: { min: number; src: string; label: string; frames?: MascotFrame[]; rig?: "bird100" }[] = [
  { min: 91, src: bird100, label: "¡Súper feliz!", rig: "bird100" },
  { min: 81, src: bird90,  label: "Feliz", frames: FRAMES_90 },
  { min: 71, src: bird80,  label: "Contento", frames: FRAMES_80 },
  { min: 61, src: bird70,  label: "Tranquilo" },
  { min: 51, src: bird60,  label: "Bien" },
  { min: 41, src: bird50,  label: "Normal" },
  { min: 31, src: bird40,  label: "Un poco triste" },
  { min: 21, src: bird30,  label: "Triste" },
  { min: 11, src: bird20,  label: "Muy mal" },
  { min: 1,  src: bird10,  label: "Agotado / Sin fuerzas" },
  { min: 0,  src: bird0,   label: "Sin vida" },
];

export function moodBird(pct: number) {
  return MOOD_BIRDS.find(b => pct >= b.min) ?? MOOD_BIRDS[MOOD_BIRDS.length - 1];
}
