import { useNavigate, useLocation } from "react-router-dom";
import { HT } from "../theme";
import { useLogisticsHub } from "../context";

const ICONS: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z",
  assign: "M9 3h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1Zm0 2v1h6V5H9ZM8 12h8M8 16h5",
  pending: "M12 3a9 9 0 1 0 9 9M12 3v9l6 3",
  completed: "m4 12 5 5L20 6",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.6a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 18a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 13.5a1.7 1.7 0 0 0-1.56-1.04H2.9a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.04A1.7 1.7 0 0 0 4.22 5.5l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 3a1.7 1.7 0 0 0 1.04-1.56V1.3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.04 3a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 7.46a1.7 1.7 0 0 0 1.56 1.04h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1Z",
  logout: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV_ITEMS = [
  { key: "home", label: "Home", path: "/logistics/hub/home", icon: "home" },
  { key: "pending", label: "Pendientes", path: "/logistics/hub/pending", icon: "pending" },
  { key: "completed", label: "Completados", path: "/logistics/hub/completed", icon: "completed" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout: logoutHub } = useLogisticsHub();

  const logout = () => {
    logoutHub();
    sessionStorage.removeItem("team");
    sessionStorage.removeItem("role");
    navigate("/");
  };

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 40,
      background: HT.surface, boxShadow: "0 1px 0 rgba(17,24,39,0.06)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", height: 56,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div
          onClick={() => navigate("/logistics/hub/home")}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: 7, background: HT.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: HT.font,
          }}>L</div>
          <span style={{ fontFamily: HT.font, fontSize: 14.5, fontWeight: 700, color: HT.text1 }}>
            Logistics Hub
          </span>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  fontFamily: HT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                  background: active ? HT.primarySoft : "transparent",
                  color: active ? HT.primary : HT.text2,
                  border: "none", borderRadius: 8, padding: "7px 12px",
                  transition: "background 0.12s",
                }}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={() => navigate("/logistics/hub/users")}
          title="Usuarios y configuración"
          style={{
            width: 32, height: 32, borderRadius: 8, border: "none",
            background: location.pathname.startsWith("/logistics/hub/users") ? HT.primarySoft : "transparent",
            color: location.pathname.startsWith("/logistics/hub/users") ? HT.primary : HT.text2,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <Icon name="gear" size={17} />
        </button>
        <button
          onClick={() => navigate("/logistics/hub/users")}
          title="Usuarios y configuración"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 4px 4px",
            borderRadius: 999, background: HT.surfaceAlt, border: "none", cursor: "pointer",
          }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%", background: HT.primary,
            color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: HT.font,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{currentUser.slice(0, 1)}</div>
          <span style={{ fontFamily: HT.font, fontSize: 12.5, fontWeight: 600, color: HT.text1 }}>{currentUser}</span>
        </button>
        <button onClick={logout} title="Salir" style={{
          width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent",
          color: HT.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name="logout" size={17} />
        </button>
      </div>
    </div>
  );
}
