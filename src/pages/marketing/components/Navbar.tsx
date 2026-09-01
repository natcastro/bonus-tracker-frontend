import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import NotificationBell from "./NotificationBell";
import Avatar from "./Avatar";

export default function Navbar() {
  const { authedUser } = useMarketing();
  const navigate = useNavigate();

  return (
    <div style={{
      background: MT.surface, borderBottom: `1px solid ${MT.border}`,
      padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 50, fontFamily: MT.font,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", cursor: "pointer" }} onClick={() => navigate("/marketing/dashboard")}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: MT.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>M</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: MT.text1, letterSpacing: "-0.01em" }}>
          FTC Hub — <span style={{ color: MT.primary }}>Marketing</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <NotificationBell />
        {authedUser && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Avatar role={authedUser.role} size={22} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: MT.text1 }}>{authedUser.name}</span>
          </div>
        )}
        <button onClick={() => { sessionStorage.clear(); navigate("/"); }} style={{
          fontFamily: MT.font, fontSize: 12, fontWeight: 600, cursor: "pointer",
          background: "transparent", border: `1px solid ${MT.border}`, color: MT.text2, borderRadius: 7, padding: "0.35rem 0.7rem",
        }}>← FTC Hub</button>
      </div>
    </div>
  );
}
