import { ROLE_CFG } from "../theme";
import type { MarketingRole } from "../types";

export default function Avatar({ role, size = 22 }: { role: MarketingRole; size?: number }) {
  const cfg = ROLE_CFG[role];
  return (
    <div title={cfg.label} style={{
      width: size, height: size, minWidth: size, borderRadius: "50%", background: cfg.color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: Math.round(size * 0.46), flexShrink: 0,
    }}>
      {cfg.label.charAt(0)}
    </div>
  );
}
