import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { useHubAccess } from "../../../auth/HubAccessContext";
import NotificationBell from "./NotificationBell";
import Avatar from "./Avatar";
import { GearIcon } from "../../../components/icons";
import MarketingSettingsPanel from "./MarketingSettingsPanel";

export default function Navbar() {
  const { authedUser } = useMarketing();
  const { access } = useHubAccess();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div style={{
      background: MT.surface, boxShadow: "0 1px 0 rgba(17,24,39,0.06)",
      padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 50, fontFamily: MT.font,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", cursor: "pointer" }} onClick={() => navigate("/marketing/tasks")}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: MT.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>M</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: MT.text1, letterSpacing: "-0.01em" }}>
          FTC Hub — <span style={{ color: MT.primary }}>Marketing</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <NotificationBell />
        {access?.isAdmin && (
          <button onClick={() => setShowSettings(true)} title="Configurar correos de notificación" style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
            background: "transparent", border: `1px solid ${MT.border}`, borderRadius: 7, cursor: "pointer", color: MT.text2,
          }}>
            <GearIcon size={15} />
          </button>
        )}
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
      {showSettings && <MarketingSettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
