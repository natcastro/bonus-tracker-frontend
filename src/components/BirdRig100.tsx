// Layered, part-animated version of the 100% happy bird: wings flap, body bobs, hearts float, sparkles twinkle.
// The artwork was cut into transparent layers of identical size, so every layer is stacked at inset:0 and
// animated with transform/opacity only (see .ftc-rig* in index.css).
import body from "../assets/birds/rig100/body.webp";
import wingL from "../assets/birds/rig100/wingL.webp";
import wingR from "../assets/birds/rig100/wingR.webp";
import heart0 from "../assets/birds/rig100/heart0.webp";
import heart1 from "../assets/birds/rig100/heart1.webp";
import spark2 from "../assets/birds/rig100/spark2.webp";
import spark3 from "../assets/birds/rig100/spark3.webp";
import spark4 from "../assets/birds/rig100/spark4.webp";

export default function BirdRig100({ label }: { label: string }) {
  return (
    <span className="ftc-rig" role="img" aria-label={label}>
      <span className="ftc-rig__fx ftc-rig__heart ftc-rig__heart--a"><img src={heart0} alt="" draggable={false} /></span>
      <span className="ftc-rig__fx ftc-rig__heart ftc-rig__heart--b"><img src={heart1} alt="" draggable={false} /></span>
      <span className="ftc-rig__fx ftc-rig__spark ftc-rig__spark--a"><img src={spark2} alt="" draggable={false} /></span>
      <span className="ftc-rig__fx ftc-rig__spark ftc-rig__spark--b"><img src={spark3} alt="" draggable={false} /></span>
      <span className="ftc-rig__fx ftc-rig__spark ftc-rig__spark--c"><img src={spark4} alt="" draggable={false} /></span>
      <span className="ftc-rig__body">
        <span className="ftc-rig__fx ftc-rig__wing ftc-rig__wing--l"><img src={wingL} alt="" draggable={false} /></span>
        <span className="ftc-rig__fx ftc-rig__wing ftc-rig__wing--r"><img src={wingR} alt="" draggable={false} /></span>
        <span className="ftc-rig__fx"><img src={body} alt="" draggable={false} /></span>
      </span>
    </span>
  );
}
