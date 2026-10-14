import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { useHubAccess } from "../../../auth/HubAccessContext";
import NotificationBell from "./NotificationBell";
import TabBar from "./TabBar";
import Avatar from "./Avatar";
import { GearIcon } from "../../../components/icons";
import MarketingSettingsPanel from "./MarketingSettingsPanel";

// Same .top-nav/.logo/.nav-links shell every other module uses (brand font, olive-green border,
// pill tabs) — Marketing used to render its own separate bar with a different font and colors.
export default function Navbar() {
  const { authedUser } = useMarketing();
  const { access } = useHubAccess();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <nav className="top-nav">
      <div className="logo" style={{ cursor: "pointer" }} onClick={() => navigate("/marketing/tasks")}>
        FTC Hub — <span style={{ color: MT.primary }}>Marketing</span>
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
        <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>← FTC Hub</button>
      </div>
      <TabBar />
      {showSettings && <MarketingSettingsPanel onClose={() => setShowSettings(false)} />}
    </nav>
  );
}
