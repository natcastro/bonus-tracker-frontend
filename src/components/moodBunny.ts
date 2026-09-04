import bunny100 from "../assets/bunnies/bunny-100.png";
import bunny90 from "../assets/bunnies/bunny-90.png";
import bunny80 from "../assets/bunnies/bunny-80.png";
import bunny70 from "../assets/bunnies/bunny-70.png";
import bunny60 from "../assets/bunnies/bunny-60.png";
import bunny50 from "../assets/bunnies/bunny-50.png";
import bunny40 from "../assets/bunnies/bunny-40.png";
import bunny30 from "../assets/bunnies/bunny-30.png";
import bunny20 from "../assets/bunnies/bunny-20.png";
import bunny10 from "../assets/bunnies/bunny-10.png";
import bunny0 from "../assets/bunnies/bunny-0.png";

// Mood mascot shared across dashboards — each bucket covers the 10 points below its label
// (e.g. 91-100 -> ¡Súper feliz!, 0 -> Sin vida).
export const MOOD_BUNNIES: { min: number; src: string; label: string }[] = [
  { min: 91, src: bunny100, label: "¡Súper feliz!" },
  { min: 81, src: bunny90,  label: "Feliz" },
  { min: 71, src: bunny80,  label: "Contento" },
  { min: 61, src: bunny70,  label: "Tranquilo" },
  { min: 51, src: bunny60,  label: "Bien" },
  { min: 41, src: bunny50,  label: "Normal" },
  { min: 31, src: bunny40,  label: "Un poco triste" },
  { min: 21, src: bunny30,  label: "Triste" },
  { min: 11, src: bunny20,  label: "Muy mal" },
  { min: 1,  src: bunny10,  label: "Agotado / Sin fuerzas" },
  { min: 0,  src: bunny0,   label: "Sin vida" },
];

export function moodBunny(pct: number) {
  return MOOD_BUNNIES.find(b => pct >= b.min) ?? MOOD_BUNNIES[MOOD_BUNNIES.length - 1];
}
