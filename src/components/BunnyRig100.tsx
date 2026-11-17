// Layered, part-animated version of the 100% happy bunny (Briefs): ears sway, arms wave in and out, body bobs,
// hearts float, sparkles twinkle. Same technique as BirdRig100 — equal-size transparent layers stacked at
// inset:0, animated with transform/opacity only (see .ftc-rig* in index.css).
import body from "../assets/bunnies/rig100/body.webp";
import earL from "../assets/bunnies/rig100/earL.webp";
import earR from "../assets/bunnies/rig100/earR.webp";
import armL from "../assets/bunnies/rig100/armL.webp";
import armR from "../assets/bunnies/rig100/armR.webp";
import heart0 from "../assets/bunnies/rig100/heart0.webp";
import heart2 from "../assets/bunnies/rig100/heart2.webp";
import spark1 from "../assets/bunnies/rig100/spark1.webp";
import spark3 from "../assets/bunnies/rig100/spark3.webp";
import spark4 from "../assets/bunnies/rig100/spark4.webp";

const L = ({ src, cls }: { src: string; cls: string }) => <span className={`ftc-rig__fx ${cls}`}><img src={src} alt="" draggable={false} /></span>;

export default function BunnyRig100({ label }: { label: string }) {
  return (
    <span className="ftc-rig ftc-rig--bunny" role="img" aria-label={label}>
      <span className="ftc-rig__body">
        <L src={earL} cls="ftc-rig__ear ftc-rig__ear--l" />
        <L src={earR} cls="ftc-rig__ear ftc-rig__ear--r" />
        <L src={armL} cls="ftc-rig__arm ftc-rig__arm--l" />
        <L src={armR} cls="ftc-rig__arm ftc-rig__arm--r" />
        <L src={body} cls="" />
      </span>
      <L src={heart0} cls="ftc-rig__heart ftc-rig__bheart--a" />
      <L src={heart2} cls="ftc-rig__heart ftc-rig__bheart--b" />
      <L src={spark1} cls="ftc-rig__spark ftc-rig__bspark--a" />
      <L src={spark3} cls="ftc-rig__spark ftc-rig__bspark--b" />
      <L src={spark4} cls="ftc-rig__spark ftc-rig__bspark--c" />
    </span>
  );
}
