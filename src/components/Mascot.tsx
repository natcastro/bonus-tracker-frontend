// Animated mood mascot (Marketing bird / bunny). Two kinds of motion:
//  - `rig` (100% bird / bunny): the art is cut into layers (wings/ears/arms, body, hearts, sparkles) animated separately — BirdRig100, BunnyRig100.
//  - `frames` (90/80% bird): a short sequence of hand-drawn poses, swapped in place (wings, eyes, hearts...).
//  - otherwise the art is one static PNG, so motion is whole-sprite transform only (idle loop per mood + squash blink).
// Hover hop is shared. Styles live in index.css (.ftc-mascot*).
import { useEffect, useState } from "react";
import BirdRig100 from "./BirdRig100";
import BunnyRig100 from "./BunnyRig100";

export type MascotTier = "happy" | "calm" | "sad" | "tired" | "dead";
export type MascotFrame = { src: string; ms: number };

// Matches the 11 image thresholds in moodBird / moodBunny, grouped by how the character should move.
export function mascotTier(pct: number): MascotTier {
  if (pct >= 71) return "happy"; // 80–100
  if (pct >= 41) return "calm";  // 50–70: relaxed breathing
  if (pct >= 21) return "sad";   // 30–40: slow, droopy
  if (pct >= 1) return "tired";  // 10–20: barely moving
  return "dead";                 // 0: still
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Mascot({ src, label, pct, size = 110, frames, rig }: { src: string; label: string; pct: number; size?: number; frames?: MascotFrame[]; rig?: "bird100" | "bunny100" }) {
  const [i, setI] = useState(0);
  const animated = !!frames && frames.length > 1 && !reducedMotion();

  useEffect(() => {
    setI(0);
    if (!animated || !frames) return;
    frames.forEach(f => { const im = new Image(); im.src = f.src; }); // avoid a flash on first swap
    let idx = 0;
    let t: number;
    const tick = () => { idx = (idx + 1) % frames.length; setI(idx); t = window.setTimeout(tick, frames[idx].ms); };
    t = window.setTimeout(tick, frames[0].ms);
    return () => window.clearTimeout(t);
  }, [frames, animated]);

  if (rig) {
    return (
      <span className="ftc-mascot ftc-mascot--happy ftc-mascot--rig" style={{ width: size, height: size }} title={`${pct}% a tiempo — ${label}`}>
        {rig === "bunny100" ? <BunnyRig100 label={label} /> : <BirdRig100 label={label} />}
      </span>
    );
  }

  const shown = frames ? frames[Math.min(i, frames.length - 1)].src : src;
  return (
    <span className={`ftc-mascot ftc-mascot--${mascotTier(pct)}${frames ? " ftc-mascot--frames" : ""}`} style={{ width: size, height: size }} title={`${pct}% a tiempo — ${label}`}>
      <img className="ftc-mascot__img" src={shown} alt={label} draggable={false} />
    </span>
  );
}
