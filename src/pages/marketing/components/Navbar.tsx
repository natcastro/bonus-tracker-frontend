import { useNavigate } from "react-router-dom";
import { MT, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const { authedUser, logout } = useMarketing();
  const navigate = useNavigate();
  const roleCfg = authedUser ? ROLE_CFG[authedUser.role] : null;

  return (
    <div style={{
      background: MT.surface, borderBottom: `1px solid ${MT.border}`,
      padding: "0.85rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 50, fontFamily: MT.font,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }} onClick={() => navigate("/marketing/dashboard")}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: MT.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15 }}>M</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: MT.text1, letterSpacing: "-0.01em" }}>
          FTC Hub — <span style={{ color: MT.primary }}>Marketing</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
        <NotificationBell />
        {roleCfg && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.4rem", background: roleCfg.soft,
            color: roleCfg.color, borderRadius: 999, padding: "0.35rem 0.75rem", fontSize: 12.5, fontWeight: 700,
          }}>
            {roleCfg.label}
          </div>
        )}
        <button onClick={() => { logout(); navigate("/marketing"); }} style={{
          fontFamily: MT.font, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          background: "transparent", border: `1px solid ${MT.border}`, color: MT.text2, borderRadius: 8, padding: "0.4rem 0.75rem",
        }}>Salir</button>
      </div>
    </div>
  );
}
